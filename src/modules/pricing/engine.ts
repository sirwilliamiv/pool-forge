import { PriceCategory, UnitType } from '@prisma/client'
import type { MeasurementSummary } from '@/modules/measurements/engine'

export { PriceCategory, UnitType }

export interface PriceBookItemLite {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: number
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
  total: number
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
      return { quantity: m.featureCount > 0 ? 1 : 0, source: 'Spa present' }
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

export function computeQuote(
  items: PriceBookItemLite[],
  measurements: MeasurementSummary,
  selections: PricingSelections = {},
): QuoteSummary {
  const lineItems: QuoteLine[] = items
    .map<QuoteLine>((item) => {
      const { quantity, source } = quantityForItem(item, measurements, selections)
      const unitPrice = Number(item.retailPrice) || 0
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        source,
        quantity: Math.round(quantity * 100) / 100,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      }
    })
    .filter((l) => l.quantity > 0)

  const subtotal = lineItems.reduce((sum, l) => sum + l.total, 0)
  return {
    lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(subtotal * 100) / 100,
  }
}
