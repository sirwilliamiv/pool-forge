// What the price book covers, and what it does not.
//
// A quote already reports this one project at a time: draw a waterfall with no
// water feature line behind it and the quote says the waterfall is unpriced.
// That is the right place to find out you have a hole, and the wrong time. The
// same honesty belongs on the price book page, where somebody can do something
// about it, and before a customer is sitting across the table.
//
// The set of categories a builder can draw is derived rather than typed out:
// `quoteCategoryForStencil` is what the quote engine consults, so this reads
// the same mapping over the same catalogue. A stencil added tomorrow shows up
// here as a hole on its own.

import { PriceCategory, UnitType } from '@prisma/client'
import { STENCILS } from '@/modules/editor/stencils'
import { quoteCategoryForStencil } from '@/modules/editor/stencils/quote-category'
import { categoryLabel } from '@/modules/pricing/engine'

/**
 * Every price category some stencil in the catalogue sells against.
 *
 * Computed, not listed. The failure this guards against is a stencil a builder
 * can place and nothing can price, which is the same defect the quote reports
 * as "drawn but not priced" after the fact.
 */
export function drawableCategories(): PriceCategory[] {
  const found = new Set<PriceCategory>()
  for (const stencil of STENCILS) {
    const category = quoteCategoryForStencil(stencil)
    if (category !== null) found.add(category)
  }
  return [...found].sort()
}

/** How many stencils sell against each category. Used to say "9 tools". */
export function stencilsPerCategory(): Map<PriceCategory, string[]> {
  const out = new Map<PriceCategory, string[]>()
  for (const stencil of STENCILS) {
    const category = quoteCategoryForStencil(stencil)
    if (category === null) continue
    const list = out.get(category) ?? []
    list.push(stencil.name)
    out.set(category, list)
  }
  return out
}

const ALL_UNITS: ReadonlySet<UnitType> = new Set(Object.values(UnitType))
const COUNT_UNITS: ReadonlySet<UnitType> = new Set([
  UnitType.EACH,
  UnitType.LUMP,
  UnitType.HOUR,
])
const NO_UNITS: ReadonlySet<UnitType> = new Set<UnitType>()

/**
 * The units the quote engine can put a measured quantity against, per category.
 *
 * A mirror of `quantityForItem` in `pricing/engine.ts`, which is a duplication
 * with a guard on it: `coverage-matches-engine.test.ts` builds a one-line book
 * for every category and unit in existence and checks this table against what
 * the engine actually bills. The table drifts and the test names the pair.
 *
 * An empty set is the honest answer for a category nothing in a drawing
 * measures: a lanai, a fence, a wall, an electrical scope or a permit fee is
 * real work with a real rate, but the quantity belongs to one job and is said
 * there. Those are reported as `PER_JOB` rather than as holes.
 */
export const BILLABLE_UNITS: Readonly<Record<PriceCategory, ReadonlySet<UnitType>>> = {
  [PriceCategory.EARTHWORK]: ALL_UNITS,
  [PriceCategory.POOL]: ALL_UNITS,
  [PriceCategory.SPA]: ALL_UNITS,
  [PriceCategory.DECK]: ALL_UNITS,
  [PriceCategory.COPING]: ALL_UNITS,
  [PriceCategory.DRAIN]: ALL_UNITS,
  [PriceCategory.BENCH]: ALL_UNITS,
  [PriceCategory.LIGHTING]: ALL_UNITS,
  [PriceCategory.EQUIPMENT]: ALL_UNITS,
  // A waterfall is counted, never measured: an area or linear water feature
  // line bills nothing because nothing in the drawing knows how big it is.
  [PriceCategory.WATER_FEATURE]: COUNT_UNITS,
  // Same for a cage. Panel area over a footprint is not something the drawing
  // holds, so a per square foot cage rate is a line that never bills.
  [PriceCategory.SCREEN]: COUNT_UNITS,
  [PriceCategory.LANAI]: NO_UNITS,
  [PriceCategory.FENCE]: NO_UNITS,
  [PriceCategory.WALL]: NO_UNITS,
  [PriceCategory.ELECTRICAL]: NO_UNITS,
  [PriceCategory.MISC]: NO_UNITS,
}

export type CoverageStatus =
  /** The book has a line the drawing can bill against. Nothing to do. */
  | 'PRICED'
  /**
   * The book has a line, but nothing in a drawing measures this category, so
   * the quantity is added on the job. The rate is still worth keeping.
   */
  | 'PER_JOB'
  /**
   * The book has a line and the category is measurable, but every line in it
   * is sold in a unit the drawing cannot produce, so none of them ever bills.
   */
  | 'UNIT_UNMEASURED'
  /** Nothing in the book. Draw one of these and the quote reports a hole. */
  | 'MISSING'

export interface CoverageRow {
  category: PriceCategory
  /** Human label. Never the raw enum. */
  label: string
  status: CoverageStatus
  /** Lines in the book for this category. */
  itemCount: number
  /** Drawing tools that sell against it, so the cost of a hole is visible. */
  toolCount: number
  /** A few tool names, for the tooltip / detail line. */
  exampleTools: string[]
  /** What this means and what to do, in a sentence. */
  detail: string
}

/** A stored price book row, as much of it as coverage reads. */
export interface CoverageItem {
  category: PriceCategory
  unitType: UnitType
}

function detailFor(
  status: CoverageStatus,
  label: string,
  toolCount: number,
): string {
  const tools = toolCount === 1 ? '1 drawing tool' : `${toolCount} drawing tools`
  const sell = toolCount === 1 ? 'sells' : 'sell'
  switch (status) {
    case 'PRICED':
      return `Priced. ${tools} ${sell} against this line.`
    case 'PER_JOB':
      return `Nothing in a drawing measures ${label.toLowerCase()}, so this rate is not billed automatically. Add it on the project under "Added to this job" and say how many.`
    case 'UNIT_UNMEASURED':
      return `Every ${label.toLowerCase()} line is sold in a unit the drawing cannot measure, so none of them bills. Sell it per item or as a lump sum, or price it on the job.`
    case 'MISSING':
      return `No ${label.toLowerCase()} line at all. ${tools} can put this on a drawing, and ${toolCount === 1 ? 'it' : 'every one of them'} will quote at nothing until you add a price.`
  }
}

/**
 * Which categories this book covers, judged against what a builder can draw.
 *
 * Ordered holes first: the point of the panel is the thing that is wrong, and
 * a builder scanning it should not have to read the healthy rows to find it.
 */
export function priceBookCoverage(items: readonly CoverageItem[]): CoverageRow[] {
  const tools = stencilsPerCategory()
  const rows: CoverageRow[] = []

  for (const category of drawableCategories()) {
    const inCategory = items.filter((item) => item.category === category)
    const billable = BILLABLE_UNITS[category]
    const measurable = billable.size > 0
    const names = tools.get(category) ?? []

    let status: CoverageStatus
    if (inCategory.length === 0) {
      status = 'MISSING'
    } else if (!measurable) {
      status = 'PER_JOB'
    } else if (inCategory.some((item) => billable.has(item.unitType))) {
      status = 'PRICED'
    } else {
      status = 'UNIT_UNMEASURED'
    }

    const label = categoryLabel(category)
    rows.push({
      category,
      label,
      status,
      itemCount: inCategory.length,
      toolCount: names.length,
      exampleTools: names.slice(0, 3),
      detail: detailFor(status, label, names.length),
    })
  }

  const rank: Record<CoverageStatus, number> = {
    MISSING: 0,
    UNIT_UNMEASURED: 1,
    PER_JOB: 2,
    PRICED: 3,
  }
  return rows.sort(
    (a, b) => rank[a.status] - rank[b.status] || a.label.localeCompare(b.label),
  )
}

/** Rows a builder should act on, i.e. the holes. */
export function coverageGaps(rows: readonly CoverageRow[]): CoverageRow[] {
  return rows.filter(
    (row) => row.status === 'MISSING' || row.status === 'UNIT_UNMEASURED',
  )
}
