import { describe, it, expect } from 'vitest'
import { ShapeKind, PriceCategory, UnitType } from '@prisma/client'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  toPriceBookItems,
  type PriceBookItemLite,
} from '@/modules/pricing/engine'
import type { Shape } from '@/modules/editor/state/shapes'

// Regression coverage for the P0 spine/pricing fixes: pool selections now reach
// the quote, required items always appear, the spa line needs a real spa, deco
// drain is no longer auto-billed at the pool perimeter, and line totals are
// internally consistent.

function poolShape(id = 'p1', depthShallow = 3, depthDeep = 5): Shape {
  return {
    id,
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: 25 * 12,
    height: 12 * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow,
    depthDeep,
  }
}

function deckShape(): Shape {
  return {
    id: 'd1',
    kind: ShapeKind.CONCRETE_DECK,
    x: 0,
    y: 0,
    width: 35 * 12,
    height: 22 * 12,
    rotation: 0,
    zIndex: 0,
    locked: false,
    hidden: false,
  }
}

function feature(kind: typeof ShapeKind.SPA | typeof ShapeKind.BENCH, id = 'f1'): Shape {
  return {
    id,
    kind,
    x: 0,
    y: 0,
    width: 7 * 12,
    height: 7 * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
  }
}

const items: PriceBookItemLite[] = [
  { id: 'pool', category: PriceCategory.POOL, name: 'Pool base', unitType: UnitType.SQFT, retailPrice: 50 },
  { id: 'pump', category: PriceCategory.EQUIPMENT, name: 'VS pump', unitType: UnitType.EACH, retailPrice: 1200, required: true },
  { id: 'heater', category: PriceCategory.EQUIPMENT, name: 'Heater', unitType: UnitType.EACH, retailPrice: 2400 },
  { id: 'screen', category: PriceCategory.SCREEN, name: 'Screen enclosure', unitType: UnitType.SQFT, retailPrice: 20 },
  { id: 'light', category: PriceCategory.LIGHTING, name: 'LED light', unitType: UnitType.EACH, retailPrice: 350 },
  { id: 'spa', category: PriceCategory.SPA, name: 'Spa', unitType: UnitType.EACH, retailPrice: 6000 },
]

describe('pricing — required items', () => {
  it('a required count-unit item (pump) appears even when nothing is selected', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), {})
    expect(q.lineItems.find((l) => l.itemId === 'pump')?.quantity).toBe(1)
  })

  it('a non-required equipment item (heater) is omitted when not selected', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), {})
    expect(q.lineItems.find((l) => l.itemId === 'heater')).toBeUndefined()
  })
})

describe('pricing — selection gating reaches the quote', () => {
  it('the heater line appears when a heater is selected', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), { heaterSelected: true })
    expect(q.lineItems.find((l) => l.itemId === 'heater')?.quantity).toBe(1)
  })

  it('the screen line appears only when the screen is selected', () => {
    const m = computeMeasurements([poolShape(), deckShape()])
    expect(computeQuote(items, m, {}).lineItems.find((l) => l.itemId === 'screen')).toBeUndefined()
    const q = computeQuote(items, m, { screenSelected: true })
    expect(q.lineItems.find((l) => l.itemId === 'screen')?.quantity ?? 0).toBeGreaterThan(0)
  })

  it('the lighting quantity flows to the lighting line', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), { lightingQuantity: 4 })
    expect(q.lineItems.find((l) => l.itemId === 'light')?.quantity).toBe(4)
  })
})

describe('pricing — spa requires an actual spa', () => {
  it('a bench alone does not add a spa line', () => {
    const q = computeQuote(items, computeMeasurements([poolShape(), feature(ShapeKind.BENCH)]), {})
    expect(q.lineItems.find((l) => l.itemId === 'spa')).toBeUndefined()
  })

  it('a spa feature adds exactly one spa line', () => {
    const q = computeQuote(items, computeMeasurements([poolShape(), feature(ShapeKind.SPA)]), {})
    expect(q.lineItems.find((l) => l.itemId === 'spa')?.quantity).toBe(1)
  })
})

describe('pricing — totals are internally consistent', () => {
  it('each line total equals rounded quantity × unit price', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), { heaterSelected: true, lightingQuantity: 3 })
    for (const l of q.lineItems) {
      expect(l.total).toBeCloseTo(Math.round(l.quantity * l.unitPrice * 100) / 100, 5)
    }
  })

  it('subtotal equals the sum of visible line totals', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), { heaterSelected: true, lightingQuantity: 2 })
    const sum = q.lineItems.reduce((s, l) => s + l.total, 0)
    expect(q.subtotal).toBeCloseTo(Math.round(sum * 100) / 100, 5)
  })
})

describe('pricing — sales tax', () => {
  it('adds tax at the given rate on top of the subtotal', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), {}, { taxRatePct: 6 })
    expect(q.taxRatePct).toBe(6)
    expect(q.taxAmount).toBeCloseTo(Math.round(q.subtotal * 0.06 * 100) / 100, 5)
    expect(q.total).toBeCloseTo(Math.round((q.subtotal + q.taxAmount) * 100) / 100, 5)
  })

  it('applies no tax by default, so total equals subtotal', () => {
    const q = computeQuote(items, computeMeasurements([poolShape()]), {})
    expect(q.taxAmount).toBe(0)
    expect(q.total).toBe(q.subtotal)
  })
})

describe('measurements — coping vs deco drain', () => {
  it('coping equals the pool perimeter', () => {
    expect(computeMeasurements([poolShape()]).copingLinearFeet).toBe(74)
  })

  it('deco drain is not auto-billed at the pool perimeter', () => {
    expect(computeMeasurements([poolShape()]).decoDrainLinearFeet).toBe(0)
  })
})

describe('measurements — spa signal and multi-pool depth', () => {
  it('a spa feature increments spaCount; a bench does not', () => {
    expect(computeMeasurements([poolShape(), feature(ShapeKind.SPA)]).spaCount).toBe(1)
    expect(computeMeasurements([poolShape(), feature(ShapeKind.BENCH)]).spaCount).toBe(0)
  })

  it('keeps the deepest depths across multiple pools instead of the last one', () => {
    const m = computeMeasurements([poolShape('a', 3, 8), poolShape('b', 4, 6)])
    expect(m.poolDepthShallow).toBe(4)
    expect(m.poolDepthDeep).toBe(8)
  })
})

describe('measurements — ellipse pool footprint', () => {
  it('an ellipse-flagged pool measures with ellipse area, not the bounding box', () => {
    const rect = computeMeasurements([poolShape()]).poolSurfaceArea
    const ellipseShape: Shape = { ...poolShape(), displayHint: { poolShape: 'ellipse' } }
    const ellipse = computeMeasurements([ellipseShape]).poolSurfaceArea
    expect(ellipse).toBeLessThan(rect)
    expect(ellipse).toBeCloseTo((Math.PI / 4) * rect, 4)
  })
})

describe('toPriceBookItems', () => {
  // Call sites used to inline this mapping and drop `required`, which silently
  // removed every required line (the VS pump) from the editor and cache quotes.
  it('carries required through and coerces the Decimal retail price', () => {
    const [item] = toPriceBookItems([
      {
        id: 'i1',
        category: PriceCategory.EQUIPMENT,
        name: 'VS pump',
        unitType: UnitType.EACH,
        retailPrice: { toString: () => '1250.5000' },
        required: true,
      },
    ])
    expect(item?.required).toBe(true)
    expect(item?.retailPrice).toBe(1250.5)
  })

  it('defaults required to false and an unparseable price to 0', () => {
    const [item] = toPriceBookItems([
      {
        id: 'i2',
        category: PriceCategory.MISC,
        name: 'Mystery',
        unitType: UnitType.LUMP,
        retailPrice: null,
      },
    ])
    expect(item?.required).toBe(false)
    expect(item?.retailPrice).toBe(0)
  })
})
