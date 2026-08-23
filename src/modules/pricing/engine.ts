import { PriceCategory, UnitType } from '@prisma/client'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import type { FinishSlot } from '@/modules/materials/slots'

export { PriceCategory, UnitType }

export interface PriceBookItemLite {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: number
  /** Required count-unit items are forced onto the quote at qty 1 (e.g. the pump). */
  required?: boolean
}

/** A `PriceBookItem` row as Prisma returns it (`retailPrice` is a Decimal). */
export interface PriceBookItemRow {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: unknown
  required?: boolean
}

/**
 * Map price-book rows to the engine's input shape. Call sites used to inline
 * this and kept forgetting `required`, which silently dropped every required
 * line (the seeded VS pump) from the quote.
 */
export function toPriceBookItems(rows: readonly PriceBookItemRow[]): PriceBookItemLite[] {
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    unitType: r.unitType,
    retailPrice: Number(r.retailPrice) || 0,
    required: r.required ?? false,
  }))
}

/**
 * A finish chosen for one pool surface, and the price-book item that bills it.
 *
 * `priceItemId` is nullable on purpose. A finish the price book cannot bill is
 * a real answer — the builder picked a material their book has no line for —
 * and the honest thing to do with it is to say so on the quote. Pricing it
 * silently at whatever the base pool line happens to charge is what the
 * material picker used to do, and it meant a $7.10 finish and a $15.75 finish
 * produced the same total.
 */
export interface FinishSelection {
  slot: FinishSlot
  /** Human label of the slot, e.g. "Interior finish". Never the raw key. */
  slotLabel: string
  materialId: string
  materialName: string
  priceItemId: string | null
}

export interface PricingSelections {
  heaterSelected?: boolean
  saltSystemSelected?: boolean
  screenSelected?: boolean
  lightingQuantity?: number
  /** What each pool surface is finished in. See `FinishSelection`. */
  finishes?: readonly FinishSelection[]
  /**
   * Every price-book item that some material in the finish catalogue claims.
   *
   * An item named here bills only when its material is the one chosen. Without
   * this, a price book holding three copings would bill all three the moment a
   * pool had a perimeter, because the engine prices by category and a category
   * cannot tell one travertine from another.
   */
  finishItemIds?: readonly string[]
}

export interface QuoteLine {
  itemId: string
  name: string
  category: PriceCategory
  source: string
  quantity: number
  unitPrice: number
  total: number
}

/**
 * Why a quote has no money in it.
 *
 * A quote that cannot be computed must say so rather than print a plausible
 * figure: an empty canvas that quoted the required pump read as "$1,855 for
 * nothing", and an organisation with no price book quoted every job at $0.
 */
export type QuoteStatus =
  /** There is a drawing and a price book; the figures below are real. */
  | 'PRICED'
  /** Nothing has been drawn, so there is nothing to price. */
  | 'NOTHING_DRAWN'
  /** Something is drawn but the organisation has no active price book. */
  | 'NO_PRICE_BOOK'

/**
 * Scope that is present in the drawing but that the price book cannot price.
 *
 * Surfaced to the user instead of being silently omitted: a waterfall that adds
 * nothing to the total is either a missing price-book row or a mistake, and
 * either way the person quoting needs to know before they send it.
 */
export interface UnpricedScope {
  category: PriceCategory
  /** Human label, e.g. "Water features". Never a raw enum. */
  label: string
  quantity: number
  unit: string
  reason: string
}

export interface QuoteSummary {
  status: QuoteStatus
  lineItems: QuoteLine[]
  subtotal: number
  taxRatePct: number
  taxAmount: number
  total: number
  unpriced: UnpricedScope[]
}

export interface QuoteOptions {
  /** Sales-tax rate applied to the subtotal, as a percentage (e.g. 6 for 6%). */
  taxRatePct?: number
}

interface QuantityResult {
  quantity: number
  source: string
}

/**
 * Is there anything in this drawing worth billing for?
 *
 * The gate that stops an empty canvas quoting money. Required price-book items
 * (the pump) are forced onto real jobs, and a job with nothing in it is not a
 * real job.
 */
export function hasBillableScope(m: MeasurementSummary): boolean {
  return (
    m.hasPool ||
    m.hasDeck ||
    m.poolSurfaceArea > 0 ||
    m.deckArea > 0 ||
    m.spaCount > 0 ||
    m.featureCount > 0 ||
    m.copingLinearFeet > 0 ||
    m.decoDrainLinearFeet > 0 ||
    m.benchLinearFeet > 0 ||
    m.lightCount > 0 ||
    m.waterFeatureCount > 0 ||
    m.cutYards > 0 ||
    m.fillYards > 0
  )
}

/**
 * The lighting count the quote actually bills.
 *
 * Lights placed on the canvas win over the number typed into the project form:
 * the drawing is the thing the customer is buying. The form only speaks when
 * nothing is drawn, which is how a quote can be built before the design is.
 */
export function effectiveLightingQuantity(
  m: MeasurementSummary,
  sel: PricingSelections,
): number {
  return m.lightCount > 0 ? m.lightCount : Math.max(0, sel.lightingQuantity ?? 0)
}

// Map a price-book item to a quantity by dispatching on its category + unit
// type enums. No string matching — every line goes through a typed branch.
function quantityForItem(
  item: PriceBookItemLite,
  m: MeasurementSummary,
  sel: PricingSelections,
): QuantityResult {
  switch (item.category) {
    case PriceCategory.EARTHWORK:
      // Cut and fill are different jobs at different rates, so the unit decides
      // which one this line is selling. A cubic-yard line with no grade prices
      // at zero rather than guessing a volume.
      if (item.unitType === UnitType.CUYD) {
        const isFill = /\bfill|import|bring in\b/i.test(item.name)
        return isFill
          ? { quantity: m.fillYards, source: 'Fill volume' }
          : { quantity: m.cutYards, source: 'Cut volume' }
      }
      return {
        quantity: m.cutYards + m.fillYards > 0 ? 1 : 0,
        source: 'Earthwork present',
      }
    case PriceCategory.POOL:
      if (item.unitType === UnitType.SQFT) {
        return { quantity: m.poolSurfaceArea, source: 'Pool surface area' }
      }
      // Waterline tile is a pool line sold by the foot, and the foot it is sold
      // by is the pool's own edge. Before this branch existed a per-linear-foot
      // pool item priced at qty 1, so a $15/lf tile band billed $15 for the job.
      if (item.unitType === UnitType.LF) {
        return { quantity: m.copingLinearFeet, source: 'Pool perimeter' }
      }
      return { quantity: m.hasPool ? 1 : 0, source: 'Pool present' }
    case PriceCategory.SPA:
      return { quantity: m.spaCount > 0 ? 1 : 0, source: 'Spa present' }
    case PriceCategory.DECK:
      return { quantity: m.deckArea, source: 'Deck area' }
    case PriceCategory.LANAI:
      return { quantity: 0, source: 'Lanai area' }
    case PriceCategory.COPING:
      return { quantity: m.copingLinearFeet, source: 'Pool perimeter' }
    case PriceCategory.DRAIN:
      return { quantity: m.decoDrainLinearFeet, source: 'Deco drain length' }
    case PriceCategory.BENCH:
      return { quantity: m.benchLinearFeet, source: 'Bench length' }
    case PriceCategory.EQUIPMENT:
      return {
        quantity: sel.heaterSelected || sel.saltSystemSelected ? 1 : 0,
        source: 'Equipment selection',
      }
    case PriceCategory.LIGHTING:
      return {
        quantity: effectiveLightingQuantity(m, sel),
        source: m.lightCount > 0 ? 'Lights in drawing' : 'Lighting selection',
      }
    case PriceCategory.WATER_FEATURE:
      // Priced per placed feature. Area / linear water-feature items price at
      // zero rather than inventing a size for a waterfall.
      return COUNT_UNIT_TYPES.has(item.unitType)
        ? { quantity: m.waterFeatureCount, source: 'Water features in drawing' }
        : { quantity: 0, source: 'Manual' }
    case PriceCategory.SCREEN:
      return {
        quantity: sel.screenSelected ? m.deckArea : 0,
        source: 'Screen over deck',
      }
    case PriceCategory.FENCE:
    case PriceCategory.WALL:
    case PriceCategory.ELECTRICAL:
    case PriceCategory.MISC:
      return { quantity: 0, source: 'Manual' }
  }
}

// Unit types that represent a discrete count / flat charge (not an area or
// linear measurement). A `required` item of one of these types is forced onto
// the quote at qty 1 even when its category rule yields 0 — e.g. a required
// variable-speed pump must appear whether or not a heater is selected. Area /
// linear required items are left at 0 so we never invent surface area.
const COUNT_UNIT_TYPES: ReadonlySet<UnitType> = new Set([
  UnitType.EACH,
  UnitType.LUMP,
  UnitType.HOUR,
])

const CATEGORY_LABELS: Record<PriceCategory, string> = {
  [PriceCategory.EARTHWORK]: 'Earthwork',
  [PriceCategory.POOL]: 'Pool shell',
  [PriceCategory.SPA]: 'Spa',
  [PriceCategory.DECK]: 'Deck',
  [PriceCategory.LANAI]: 'Lanai',
  [PriceCategory.COPING]: 'Coping',
  [PriceCategory.DRAIN]: 'Deco drain',
  [PriceCategory.BENCH]: 'Benches',
  [PriceCategory.EQUIPMENT]: 'Equipment',
  [PriceCategory.LIGHTING]: 'Lighting',
  [PriceCategory.WATER_FEATURE]: 'Water features',
  [PriceCategory.SCREEN]: 'Screen enclosure',
  [PriceCategory.FENCE]: 'Fence',
  [PriceCategory.WALL]: 'Walls',
  [PriceCategory.ELECTRICAL]: 'Electrical',
  [PriceCategory.MISC]: 'Other',
}

/** The user-facing name of a price-book category. Never print the raw enum. */
export function categoryLabel(category: PriceCategory): string {
  return CATEGORY_LABELS[category]
}

/** Scope present in the drawing, in the units the person reads it in. */
function scopePresent(
  m: MeasurementSummary,
  sel: PricingSelections,
): Array<{ category: PriceCategory; quantity: number; unit: string }> {
  return [
    { category: PriceCategory.POOL, quantity: m.poolSurfaceArea, unit: 'sq ft' },
    { category: PriceCategory.SPA, quantity: m.spaCount, unit: 'placed' },
    { category: PriceCategory.DECK, quantity: m.deckArea, unit: 'sq ft' },
    { category: PriceCategory.COPING, quantity: m.copingLinearFeet, unit: 'LF' },
    { category: PriceCategory.DRAIN, quantity: m.decoDrainLinearFeet, unit: 'LF' },
    { category: PriceCategory.BENCH, quantity: m.benchLinearFeet, unit: 'LF' },
    { category: PriceCategory.LIGHTING, quantity: effectiveLightingQuantity(m, sel), unit: 'placed' },
    { category: PriceCategory.WATER_FEATURE, quantity: m.waterFeatureCount, unit: 'placed' },
    {
      category: PriceCategory.SCREEN,
      quantity: sel.screenSelected ? m.deckArea : 0,
      unit: 'sq ft',
    },
    {
      category: PriceCategory.EQUIPMENT,
      quantity: sel.heaterSelected || sel.saltSystemSelected ? 1 : 0,
      unit: 'selected',
    },
    { category: PriceCategory.EARTHWORK, quantity: m.cutYards + m.fillYards, unit: 'cu yd' },
  ]
}

/**
 * How much of the drawing a finish covers, in the unit its slot is billed in.
 * Only used to report a finish the price book cannot bill.
 */
function finishQuantity(
  slot: FinishSlot,
  m: MeasurementSummary,
): { quantity: number; unit: string } {
  return slot === 'interior'
    ? { quantity: m.poolSurfaceArea, unit: 'sq ft' }
    : { quantity: m.copingLinearFeet, unit: 'LF' }
}

/**
 * Finishes chosen that no price-book item bills.
 *
 * Reported by name and by slot rather than folded into the category-level
 * report, because the category is usually priced: a pool with a finish the book
 * has no line for still has a `Pool Base` line, so nothing at the category
 * level looks wrong. The builder has to be told which finish is free.
 */
function unpricedFinishes(m: MeasurementSummary, sel: PricingSelections): UnpricedScope[] {
  const out: UnpricedScope[] = []
  for (const finish of sel.finishes ?? []) {
    if (finish.priceItemId !== null) continue
    const { quantity, unit } = finishQuantity(finish.slot, m)
    if (quantity <= 0) continue
    out.push({
      category: finish.slot === 'coping' ? PriceCategory.COPING : PriceCategory.POOL,
      label: `${finish.slotLabel} — ${finish.materialName}`,
      quantity: Math.round(quantity * 100) / 100,
      unit,
      reason: 'This finish has no price-book item, so nothing is billed for it',
    })
  }
  return out
}

function unpricedScope(
  items: readonly PriceBookItemLite[],
  lineItems: readonly QuoteLine[],
  m: MeasurementSummary,
  sel: PricingSelections,
): UnpricedScope[] {
  const pricedCategories = new Set(lineItems.map((l) => l.category))
  const bookCategories = new Set(items.map((i) => i.category))
  const out: UnpricedScope[] = unpricedFinishes(m, sel)
  for (const scope of scopePresent(m, sel)) {
    if (scope.quantity <= 0) continue
    if (pricedCategories.has(scope.category)) continue
    const label = categoryLabel(scope.category)
    out.push({
      category: scope.category,
      label,
      quantity: Math.round(scope.quantity * 100) / 100,
      unit: scope.unit,
      reason: bookCategories.has(scope.category)
        ? `The price book has no ${label.toLowerCase()} item that fits this drawing`
        : `No ${label.toLowerCase()} item in the price book`,
    })
  }
  return out
}

function emptyQuote(status: QuoteStatus, taxRatePct: number, unpriced: UnpricedScope[] = []): QuoteSummary {
  return {
    status,
    lineItems: [],
    subtotal: 0,
    taxRatePct,
    taxAmount: 0,
    total: 0,
    unpriced,
  }
}

export function computeQuote(
  items: PriceBookItemLite[],
  measurements: MeasurementSummary,
  selections: PricingSelections = {},
  options: QuoteOptions = {},
): QuoteSummary {
  const taxRatePct = Math.max(0, options.taxRatePct ?? 0)

  // Nothing drawn is not "$0 of work agreed", it is "no answer yet". Return
  // before any required item is forced onto the sheet.
  if (!hasBillableScope(measurements)) return emptyQuote('NOTHING_DRAWN', taxRatePct)

  // A drawing with no price book behind it cannot be priced at all. Quoting it
  // at $0 told twenty-one projects in this database that they were free.
  if (items.length === 0) {
    return emptyQuote(
      'NO_PRICE_BOOK',
      taxRatePct,
      unpricedScope([], [], measurements, selections),
    )
  }

  // Which price-book items belong to a finish, and which of those was picked.
  // An item claimed by the catalogue and not picked bills nothing at all: it is
  // an alternative the customer did not choose, not scope on this job.
  const claimedByAFinish = new Set(selections.finishItemIds ?? [])
  const chosenFinishItems = new Set(
    (selections.finishes ?? [])
      .map((finish) => finish.priceItemId)
      .filter((id): id is string => id !== null),
  )

  const lineItems: QuoteLine[] = items
    .map<QuoteLine>((item) => {
      const derived = quantityForItem(item, measurements, selections)
      let quantity = derived.quantity
      let source = derived.source
      if (item.required && quantity <= 0 && COUNT_UNIT_TYPES.has(item.unitType)) {
        quantity = 1
        source = 'Required'
      }
      if (claimedByAFinish.has(item.id) && !chosenFinishItems.has(item.id)) {
        quantity = 0
        source = 'Finish not selected'
      } else if (chosenFinishItems.has(item.id)) {
        source = 'Selected finish'
      }
      // Round the quantity first, then derive the line total from the rounded
      // quantity so `quantity × unitPrice` always equals the printed line total.
      const roundedQty = Math.round(quantity * 100) / 100
      const unitPrice = Number(item.retailPrice) || 0
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        source,
        quantity: roundedQty,
        unitPrice,
        total: Math.round(roundedQty * unitPrice * 100) / 100,
      }
    })
    .filter((l) => l.quantity > 0)

  const subtotal = Math.round(lineItems.reduce((sum, l) => sum + l.total, 0) * 100) / 100
  const taxAmount = Math.round(subtotal * (taxRatePct / 100) * 100) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100
  return {
    status: 'PRICED',
    lineItems,
    subtotal,
    taxRatePct,
    taxAmount,
    total,
    unpriced: unpricedScope(items, lineItems, measurements, selections),
  }
}
