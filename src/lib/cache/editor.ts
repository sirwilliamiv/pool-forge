'use server'

// Write-through caches for editor mount-time data.
//
// Reads are called from the editor page's server component (cache-first;
// recompute on miss). Writes are called from EditorPersistence (client) via
// these server actions after a successful debounced save.

import { PriceCategory } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, toPriceBookItems, type QuoteSummary } from '@/modules/pricing/engine'
import {
  pricingSelectionsFrom,
  validationSelectionsFrom,
} from '@/modules/projects/pool-fields'
import { runValidation } from '@/modules/validation/engine'
import type {
  ValidationContext,
  ValidationItem,
  ValidationProject,
  ValidationReport,
} from '@/modules/validation/types'
import type { Shape } from '@/modules/editor/state/shapes'

async function requireOrg(): Promise<{ orgId: string }> {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error('Not authenticated')
  return { orgId: session.user.orgId }
}

// ----- READS -----

export async function loadCachedQuote(projectId: string): Promise<QuoteSummary | null> {
  const row = await db.quote.findFirst({
    where: { projectId },
    orderBy: { generatedAt: 'desc' },
    include: { lineItems: true },
  })
  // An empty cache row is a miss, not an authoritative "$0". Treating it as a
  // hit pinned the editor dock to "no quote" while the exports priced the same
  // drawing at full value.
  if (!row || row.lineItems.length === 0) return null

  const subtotal = Number(row.subtotal)
  const total = Number(row.total)
  // Cached rows store subtotal + total only; recover the tax split from them.
  const taxAmount = Math.round((total - subtotal) * 100) / 100
  const taxRatePct = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0

  // `QuoteLineItem` has no category column, so the snapshot is the only place
  // the real categories survive — without it every line reads as POOL and the
  // inspector's grouping is wrong.
  const snapshotLines = readSnapshotLineItems(row.snapshot)

  return {
    subtotal,
    total,
    taxRatePct,
    taxAmount,
    lineItems: row.lineItems.map((l, i) => ({
      itemId: l.id,
      name: l.name,
      category: snapshotLines[i]?.category ?? PriceCategory.MISC,
      source: l.source,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      total: Number(l.total),
    })),
  }
}

function readSnapshotLineItems(snapshot: unknown): Array<{ category: PriceCategory }> {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return []
  const lines = (snapshot as { lineItems?: unknown }).lineItems
  if (!Array.isArray(lines)) return []
  return lines.map((l) => {
    const category = (l as { category?: unknown } | null)?.category
    return {
      category:
        typeof category === 'string' && category in PriceCategory
          ? (category as PriceCategory)
          : PriceCategory.MISC,
    }
  })
}

export async function loadCachedValidation(
  projectId: string,
): Promise<ValidationReport | null> {
  const row = await db.validationResult.findFirst({
    where: { projectId },
    orderBy: { runAt: 'desc' },
  })
  if (!row) return null
  const items = Array.isArray(row.items) ? (row.items as unknown as ValidationItem[]) : []
  const counts = { pass: 0, warn: 0, error: 0 }
  for (const it of items) counts[it.level] += 1
  return { items, counts }
}

// ----- WRITES -----

export async function writeCachedQuote(
  projectId: string,
  priceBookId: string,
  summary: QuoteSummary,
): Promise<void> {
  await requireOrg()
  await db.$transaction(async (tx) => {
    await tx.quote.deleteMany({ where: { projectId } })
    await tx.quote.create({
      data: {
        projectId,
        priceBookId,
        subtotal: summary.subtotal,
        total: summary.total,
        snapshot: { lineItems: summary.lineItems } as object,
        lineItems: {
          create: summary.lineItems.map((l) => ({
            name: l.name,
            source: l.source,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.total,
          })),
        },
      },
    })
  })
}

export async function writeCachedValidation(
  projectId: string,
  report: ValidationReport,
): Promise<void> {
  await requireOrg()
  await db.$transaction(async (tx) => {
    await tx.validationResult.deleteMany({ where: { projectId } })
    await tx.validationResult.create({
      data: { projectId, items: report.items as unknown as object },
    })
  })
}

// ----- COMBINED RECOMPUTE -----

/**
 * Server action called from EditorPersistence after a debounced save commits.
 * Recomputes quote + validation from the persisted shapes and writes both caches.
 * Fire-and-forget on the client; errors are swallowed (logged server-side).
 */
export async function recomputeAndCacheEditor(projectId: string): Promise<void> {
  try {
    const { orgId } = await requireOrg()
    const project = await db.project.findFirst({
      where: { id: projectId, orgId },
      select: {
        id: true,
        name: true,
        poolFields: true,
        proposalExpiresAt: true,
        org: { select: { taxRatePct: true } },
        customer: { select: { name: true, address: true } },
        drawing: { select: { rootJson: true } },
      },
    })
    if (!project) return

    const raw = project.drawing?.rootJson as unknown
    const shapes: Shape[] =
      raw && typeof raw === 'object' && !Array.isArray(raw) &&
      Array.isArray((raw as { shapes?: unknown }).shapes)
        ? ((raw as { shapes: Shape[] }).shapes ?? [])
        : []

    const poolFields =
      project.poolFields && typeof project.poolFields === 'object' && !Array.isArray(project.poolFields)
        ? (project.poolFields as Record<string, unknown>)
        : {}

    const measurements = computeMeasurements(shapes)

    const priceBook = await db.priceBook.findFirst({
      where: { orgId, isActive: true },
      orderBy: { version: 'desc' },
      include: { items: true },
    })
    if (priceBook) {
      const summary = computeQuote(
        toPriceBookItems(priceBook.items),
        measurements,
        pricingSelectionsFrom(poolFields),
        { taxRatePct: project.org?.taxRatePct ?? 0 },
      )
      await writeCachedQuote(projectId, priceBook.id, summary)
    }

    const validationProject: ValidationProject = {
      name: project.name,
      customerName: project.customer?.name ?? null,
      address: project.customer?.address ?? null,
      poolFields,
      proposalExpiresAt: project.proposalExpiresAt
        ? project.proposalExpiresAt.toISOString()
        : null,
    }
    const ctx: ValidationContext = {
      project: validationProject,
      measurements,
      selections: validationSelectionsFrom(poolFields),
      shapeCount: shapes.length,
      hasDeck: measurements.hasDeck,
    }
    const report = runValidation(ctx)
    await writeCachedValidation(projectId, report)
  } catch (err) {
    console.error('recomputeAndCacheEditor failed', err)
  }
}
