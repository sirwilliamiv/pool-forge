import { db } from '@/lib/db'
import type { Shape } from '@/modules/editor/state/shapes'
import { parseGrade } from '@/modules/editor/drawing-payload'
import type { Bounds, SiteGrade } from '@/modules/editor/grade/model'
import { visibleBounds } from '@/modules/editor/placement'
import { computeMeasurements, withEarthwork, type MeasurementSummary } from '@/modules/measurements/engine'
import {
  computeQuote,
  toPriceBookItems,
  type PriceBookItemLite,
  type PricingSelections,
  type QuoteSummary,
} from '@/modules/pricing/engine'
import { pricingSelectionsFrom } from '@/modules/projects/pool-fields'
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
function gradeOf(root: unknown): { existing: SiteGrade; finished: SiteGrade } | null {
  if (!root || typeof root !== 'object') return null
  return parseGrade((root as { grade?: unknown }).grade)
}

/** The site's extent, which is the area earthwork is measured over. */
function boundsOf(shapes: Shape[]): Bounds | null {
  return visibleBounds(shapes)
}

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
    // Earthwork folded in here rather than at each call site: the quote, the
    // proposal and the editor dock all read this, and three copies would
    // disagree about how much dirt is moving.
    measurements: withEarthwork(computeMeasurements(shapes), gradeOf(root), boundsOf(shapes)),
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

export interface ProjectQuote {
  shapes: Shape[]
  measurements: MeasurementSummary
  selections: PricingSelections
  quote: QuoteSummary
  /** The priced inputs, so a client can recompute the same quote as it draws. */
  items: PriceBookItemLite[]
  taxRatePct: number
  priceBookId: string | null
}

/**
 * The one place a priced project is built.
 *
 * The editor, the proposal, the construction packet, the screen RFQ, the shared
 * customer link and the voice command all used to assemble these four inputs
 * themselves. They drifted: only this loader folded earthwork into the
 * measurements, so a graded site quoted one number to the salesperson and
 * another to the customer. There is now a single path, and "one number
 * everywhere" is a property of the code rather than a promise.
 */
export async function loadProjectQuote(
  projectId: string,
  orgId: string,
): Promise<ProjectQuote | null> {
  const snapshot = await loadProjectSnapshot(projectId, orgId)
  if (!snapshot) return null
  const selections = pricingSelectionsFrom(snapshot.poolFields)
  return {
    shapes: snapshot.shapes,
    measurements: snapshot.measurements,
    selections,
    items: snapshot.items,
    taxRatePct: snapshot.taxRatePct,
    priceBookId: snapshot.priceBookId,
    quote: computeQuote(snapshot.items, snapshot.measurements, selections, {
      taxRatePct: snapshot.taxRatePct,
    }),
  }
}
