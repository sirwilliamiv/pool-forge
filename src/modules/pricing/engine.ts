import type { MeasurementSummary } from '@/modules/measurements/engine'

export interface PriceBookItemLite {
  id: string
  category: string
  name: string
  unitType: string
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
  category: string
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

// Map a price-book item to a quantity using its category + unit type
// against the live measurement summary.
function quantityForItem(
  item: PriceBookItemLite,
  m: MeasurementSummary,
  sel: PricingSelections,
): { quantity: number; source: string } {
  const cat = item.category.toLowerCase()
  const unit = item.unitType.toLowerCase()

  if (cat.includes('pool') && unit === 'sqft') {
    return { quantity: m.poolSurfaceArea, source: 'Pool surface area' }
  }
  if (cat.includes('deck') && unit === 'sqft') {
    return { quantity: m.deckArea, source: 'Deck area' }
  }
  if (cat.includes('coping') && unit === 'lf') {
    return { quantity: m.copingLinearFeet, source: 'Pool perimeter' }
  }
  if (cat.includes('drain') && unit === 'lf') {
    return { quantity: m.decoDrainLinearFeet, source: 'Deco drain length' }
  }
  if (cat.includes('bench') && unit === 'lf') {
    return { quantity: m.benchLinearFeet, source: 'Bench length' }
  }
  if (cat.includes('equipment') && unit === 'each') {
    const qty = sel.heaterSelected || sel.saltSystemSelected ? 1 : 0
    return { quantity: qty, source: 'Equipment selection' }
  }
  if (cat.includes('lighting') && unit === 'each') {
    return { quantity: sel.lightingQuantity ?? 0, source: 'Lighting count' }
  }
  if (cat.includes('screen') && unit === 'sqft') {
    return { quantity: sel.screenSelected ? m.deckArea : 0, source: 'Screen over deck' }
  }
  return { quantity: 0, source: 'Manual' }
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
