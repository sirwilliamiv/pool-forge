import { db } from '@/lib/db'
import type { Shape } from '@/modules/editor/state/shapes'
import { computeMeasurements, type MeasurementSummary } from '@/modules/measurements/engine'
import { toPriceBookItems, type PriceBookItemLite } from '@/modules/pricing/engine'
import type { ValidationProject } from '@/modules/validation/types'

// Everything the read-only commands need about a project, loaded once.
//
// The editor page already assembles this: drawing, price book, pool fields,
// measurements. Three commands each repeating it is three copies to drift, and
// a quote computed from slightly different inputs than the one on screen is
// worse than no quote at all.

export interface ProjectSnapshot {
  id: string
  name: string
  shapes: Shape[]
  measurements: MeasurementSummary
  items: PriceBookItemLite[]
  priceBookId: string | null
  poolFields: unknown
  taxRatePct: number
  validationProject: ValidationProject
}

/**
 * Load a project, or null when it is not this organisation's.
 *
 * Null rather than a throw: every caller turns it into the same sentence, and a
 * missing project is an ordinary answer to a spoken request, not an exception.
 */
export async function loadProjectSnapshot(
  projectId: string,
  orgId: string,
): Promise<ProjectSnapshot | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    select: {
      id: true,
      name: true,
      poolFields: true,
      proposalExpiresAt: true,
      drawing: { select: { rootJson: true } },
      org: { select: { taxRatePct: true } },
      customer: { select: { name: true, address: true } },
    },
  })
  if (!project) return null

  const root = project.drawing?.rootJson
  const shapes =
    root && typeof root === 'object' && Array.isArray((root as { shapes?: unknown }).shapes)
      ? ((root as unknown as { shapes: Shape[] }).shapes)
      : []

  const priceBook = await db.priceBook.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: 'desc' },
    include: { items: true },
  })

  return {
    id: project.id,
    name: project.name,
    shapes,
    measurements: computeMeasurements(shapes),
    items: toPriceBookItems(priceBook?.items ?? []),
    priceBookId: priceBook?.id ?? null,
    poolFields: project.poolFields,
    taxRatePct: project.org?.taxRatePct ?? 0,
    validationProject: {
      name: project.name,
      customerName: project.customer?.name ?? null,
      address: project.customer?.address ?? null,
      poolFields: (project.poolFields ?? {}) as Record<string, unknown>,
      proposalExpiresAt: project.proposalExpiresAt
        ? project.proposalExpiresAt.toISOString()
        : null,
    },
  }
}
