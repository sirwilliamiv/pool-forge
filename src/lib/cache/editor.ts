'use server'

// Write-through caches for editor mount-time data.
//
// Reads are called from the editor page's server component (cache-first;
// recompute on miss). Writes are called from EditorPersistence (client) via
// these server actions after a successful debounced save.

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  type PriceBookItemLite,
  type PricingSelections,
  type QuoteSummary,
} from '@/modules/pricing/engine'
import { runValidation } from '@/modules/validation/engine'
import type {
  ValidationContext,
  ValidationItem,
  ValidationProject,
  ValidationReport,
  ValidationSelections,
} from '@/modules/validation/types'
import type { Shape } from '@/modules/editor/state/shapes'

async function requireOrg(): Promise<{ orgId: string }> {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error('Not authenticated')
  return { orgId: session.user.orgId }
}

function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1
}

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

// ----- READS -----

export async function loadCachedQuote(projectId: string): Promise<QuoteSummary | null> {
  const row = await db.quote.findFirst({
    where: { projectId },
    orderBy: { generatedAt: 'desc' },
    include: { lineItems: true },
  })
  if (!row) return null
  return {
    subtotal: Number(row.subtotal),
    total: Number(row.total),
    lineItems: row.lineItems.map((l) => ({
      itemId: l.id,
      name: l.name,
      category: 'POOL',
      source: l.source,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      total: Number(l.total),
    })) as QuoteSummary['lineItems'],
  }
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
      const items: PriceBookItemLite[] = priceBook.items.map((i) => ({
        id: i.id,
        category: i.category,
        name: i.name,
        unitType: i.unitType,
        retailPrice: Number(i.retailPrice),
      }))
      const pricingSelections: PricingSelections = {
        heaterSelected: asBool(poolFields.heaterSelected),
        saltSystemSelected: asBool(poolFields.saltSystemSelected),
        screenSelected: asBool(poolFields.screenSelected),
        lightingQuantity: asNumber(poolFields.lightingQuantity),
      }
      const summary = computeQuote(items, measurements, pricingSelections)
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
    const validationSelections: ValidationSelections = {
      heaterSelected: asBool(poolFields.heaterSelected),
      saltSelected: asBool(poolFields.saltSystemSelected),
      screenSelected: asBool(poolFields.screenSelected),
      lightingQuantity: asNumber(poolFields.lightingQuantity),
    }
    const ctx: ValidationContext = {
      project: validationProject,
      measurements,
      selections: validationSelections,
      shapeCount: shapes.length,
      hasDeck: measurements.hasDeck,
    }
    const report = runValidation(ctx)
    await writeCachedValidation(projectId, report)
  } catch (err) {
    console.error('recomputeAndCacheEditor failed', err)
  }
}
