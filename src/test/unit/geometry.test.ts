import { describe, it, expect } from 'vitest'
import {
  rectangleAreaSqft,
  rectanglePerimeterLf,
  poolGallons,
  resizeToTargetArea,
  wettedAreaSqft,
} from '@/lib/geometry/rectangle'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, type PriceBookItemLite } from '@/modules/pricing/engine'
import type { Shape } from '@/modules/editor/state/shapes'

describe('rectangle geometry', () => {
  it('area: 25ft × 12ft pool = 300 sqft', () => {
    expect(rectangleAreaSqft(25 * 12, 12 * 12)).toBe(300)
  })

  it('perimeter: 25ft × 12ft pool = 74 lf', () => {
    expect(rectanglePerimeterLf(25 * 12, 12 * 12)).toBe(74)
  })

  it('gallons: 300 sqft × 4ft avg depth ≈ 8976', () => {
    expect(Math.round(poolGallons(300, 4))).toBe(8977)
  })

  it('wetted area = surface + perimeter × avg depth', () => {
    expect(wettedAreaSqft(300, 74, 4)).toBe(596)
  })

  it('resize to target area preserves aspect ratio', () => {
    const out = resizeToTargetArea(25 * 12, 12 * 12, 600)
    const w = out.widthInches / 12
    const h = out.heightInches / 12
    expect(rectangleAreaSqft(out.widthInches, out.heightInches)).toBeCloseTo(600, 5)
    expect(w / h).toBeCloseTo(25 / 12, 5)
  })
})

describe('measurement engine', () => {
  const pool: Shape = {
    id: 'p1',
    kind: 'rectangle-pool',
    x: 0,
    y: 0,
    width: 25 * 12,
    height: 12 * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: 3,
    depthDeep: 5,
  }
  const deck: Shape = {
    id: 'd1',
    kind: 'concrete-deck',
    x: 0,
    y: 0,
    width: 35 * 12,
    height: 22 * 12,
    rotation: 0,
    zIndex: 0,
    locked: false,
    hidden: false,
  }

  it('rolls up pool + deck into a summary', () => {
    const m = computeMeasurements([pool, deck])
    expect(m.poolSurfaceArea).toBe(300)
    expect(m.poolPerimeter).toBe(74)
    expect(m.poolAvgDepth).toBe(4)
    expect(Math.round(m.poolGallons)).toBe(8977)
    expect(m.deckArea).toBe(770)
    expect(m.copingLinearFeet).toBe(74)
    expect(m.hasPool).toBe(true)
    expect(m.hasDeck).toBe(true)
  })

  it('skips hidden shapes', () => {
    const m = computeMeasurements([{ ...pool, hidden: true }, deck])
    expect(m.hasPool).toBe(false)
    expect(m.poolSurfaceArea).toBe(0)
  })
})

describe('pricing engine', () => {
  const items: PriceBookItemLite[] = [
    { id: '1', category: 'Pool', name: 'Pool base', unitType: 'sqft', retailPrice: 50 },
    { id: '2', category: 'Deck', name: 'Concrete deck', unitType: 'sqft', retailPrice: 12 },
    { id: '3', category: 'Coping', name: 'Travertine coping', unitType: 'lf', retailPrice: 18 },
    { id: '4', category: 'Equipment', name: 'Heater', unitType: 'each', retailPrice: 2400 },
  ]

  it('computes a realistic quote from measurements', () => {
    const measurements = computeMeasurements([
      {
        id: 'p',
        kind: 'rectangle-pool',
        x: 0,
        y: 0,
        width: 25 * 12,
        height: 12 * 12,
        rotation: 0,
        zIndex: 1,
        locked: false,
        hidden: false,
        depthShallow: 3,
        depthDeep: 5,
      },
      {
        id: 'd',
        kind: 'concrete-deck',
        x: 0,
        y: 0,
        width: 35 * 12,
        height: 22 * 12,
        rotation: 0,
        zIndex: 0,
        locked: false,
        hidden: false,
      },
    ])
    const q = computeQuote(items, measurements, { heaterSelected: true })
    // Pool 300×$50 + Deck 770×$12 + Coping 74×$18 + Heater $2400
    expect(q.subtotal).toBeCloseTo(300 * 50 + 770 * 12 + 74 * 18 + 2400, 1)
    expect(q.lineItems.find((l) => l.category === 'Pool')?.quantity).toBe(300)
    expect(q.lineItems.find((l) => l.category === 'Equipment')?.quantity).toBe(1)
  })

  it('omits equipment when not selected', () => {
    const m = computeMeasurements([])
    const q = computeQuote(items, m, {})
    expect(q.lineItems.find((l) => l.category === 'Equipment')).toBeUndefined()
  })
})
