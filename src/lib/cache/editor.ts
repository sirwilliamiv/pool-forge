'use server'

// Write-through caches for editor mount-time data.
//
// Reads are called from the editor page's server component (cache-first;
// recompute on miss). Writes are called from EditorPersistence (client) via
// these server actions after a successful debounced save.

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, toPriceBookItems, type QuoteSummary } from '@/modules/pricing/engine'
import {
  buildFinishCatalog,
  resolveFinishes,
  type MaterialRow,
} from '@/modules/materials/catalog'
import {
  poolFieldsWithFinishes,
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
//
// There is deliberately no cached-quote read. The editor renders a quote it
// computes from the drawing in front of the user; serving the last saved one
// showed a stale price beside a live drawing (one project in this database was
// $1,350 adrift of its own proposal). The `Quote` row is still written below as
// the persisted record of a priced job.

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

    const measurements = computeMeasurements(shapes)

    const priceBook = await db.priceBook.findFirst({
      where: { orgId, isActive: true },
      orderBy: { version: 'desc' },
      include: { items: true },
    })
    const items = toPriceBookItems(priceBook?.items ?? [])

    // The finishes on the drawing, resolved the same way `loadProjectQuote`
    // resolves them. This cache is written on every save and read by the
    // project page, so computing it without the finishes would put a total on
    // the project card several thousand dollars below the one on the dock.
    const materialRows = await db.material.findMany({
      where: { OR: [{ orgId }, { orgId: null }] },
      select: { id: true, kind: true, name: true, fillSpec: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    })
    const finishCatalog = buildFinishCatalog(materialRows as MaterialRow[], items)
    const finishes = resolveFinishes(shapes, finishCatalog)
    const poolFields = poolFieldsWithFinishes(project.poolFields, finishes) as unknown as Record<
      string,
      unknown
    >

    if (priceBook) {
      const summary = computeQuote(
        items,
        measurements,
        {
          ...pricingSelectionsFrom(poolFields),
          finishes,
          finishItemIds: finishCatalog.claimedItemIds,
        },
        { taxRatePct: project.org?.taxRatePct ?? 0 },
      )
      // Only a real quote is recorded. An empty drawing has no price, and a row
      // saying "$0" is a claim rather than an absence.
      if (summary.status === 'PRICED') {
        await writeCachedQuote(projectId, priceBook.id, summary)
      } else {
        await db.quote.deleteMany({ where: { projectId } })
      }
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
