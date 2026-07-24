import { PriceCategory, UnitType } from '@prisma/client'
import type { MeasurementSummary } from '@/modules/measurements/engine'

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

export interface PricingSelections {
  heaterSelected?: boolean
  saltSystemSelected?: boolean
  screenSelected?: boolean
  lightingQuantity?: number
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

export interface QuoteSummary {
  lineItems: QuoteLine[]
  subtotal: number
  taxRatePct: number
  taxAmount: number
  total: number
}

export interface QuoteOptions {
  /** Sales-tax rate applied to the subtotal, as a percentage (e.g. 6 for 6%). */
  taxRatePct?: number
}

interface QuantityResult {
  quantity: number
  source: string
}

// Map a price-book item to a quantity by dispatching on its category + unit
// type enums. No string matching — every line goes through a typed branch.
function quantityForItem(
  item: PriceBookItemLite,
  m: MeasurementSummary,
  sel: PricingSelections,
): QuantityResult {
  switch (item.category) {
    case PriceCategory.POOL:
      return item.unitType === UnitType.SQFT
        ? { quantity: m.poolSurfaceArea, source: 'Pool surface area' }
        : { quantity: m.hasPool ? 1 : 0, source: 'Pool present' }
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
      return { quantity: sel.lightingQuantity ?? 0, source: 'Lighting count' }
    case PriceCategory.SCREEN:
      return {
        quantity: sel.screenSelected ? m.deckArea : 0,
        source: 'Screen over deck',
      }
    case PriceCategory.WATER_FEATURE:
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

export function computeQuote(
  items: PriceBookItemLite[],
  measurements: MeasurementSummary,
  selections: PricingSelections = {},
  options: QuoteOptions = {},
): QuoteSummary {
  const lineItems: QuoteLine[] = items
    .map<QuoteLine>((item) => {
      const derived = quantityForItem(item, measurements, selections)
      let quantity = derived.quantity
      let source = derived.source
      if (item.required && quantity <= 0 && COUNT_UNIT_TYPES.has(item.unitType)) {
        quantity = 1
        source = 'Required'
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
  const taxRatePct = Math.max(0, options.taxRatePct ?? 0)
  const taxAmount = Math.round(subtotal * (taxRatePct / 100) * 100) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100
  return { lineItems, subtotal, taxRatePct, taxAmount, total }
}
