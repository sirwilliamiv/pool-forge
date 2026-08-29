// The whole point, stated as a test: a builder who signed up an hour ago draws
// a pool and gets a number.
//
// Before the starter book existed, this exact drawing returned status
// NO_PRICE_BOOK and the editor said "this drawing cannot be priced". An
// organisation in the dev database has zero price books and twenty one
// projects, and every one of them quoted at $0 until the engine started
// refusing to.

import { describe, expect, it } from 'vitest'
import { ShapeKind } from '@prisma/client'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote } from '@/modules/pricing/engine'
import type { Shape } from '@/modules/editor/state/shapes'
import { starterBookItems } from '@/test/fixtures/starter-book'

function pool(widthFt: number, heightFt: number): Shape {
  return {
    id: 'pool-1',
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: widthFt * 12,
    height: heightFt * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: 3,
    depthDeep: 6,
  }
}

function stencil(id: string, stencilId: string, wFt: number, hFt: number): Shape {
  return {
    id,
    kind: ShapeKind.STENCIL,
    stencilId,
    x: 0,
    y: 0,
    width: wFt * 12,
    height: hFt * 12,
    rotation: 0,
    zIndex: 2,
    locked: false,
    hidden: false,
  }
}

const BOOK = starterBookItems()

describe('a pool drawn on day one', () => {
  const measurements = computeMeasurements([pool(25, 16)])
  const quote = computeQuote(BOOK, measurements, {}, { taxRatePct: 6 })

  it('is priced rather than refused', () => {
    expect(quote.status).toBe('PRICED')
  })

  it('has real money on it', () => {
    expect(quote.subtotal).toBeGreaterThan(0)
    expect(quote.total).toBeGreaterThan(quote.subtotal)
  })

  it('bills the shell by the square foot it was drawn at', () => {
    const shell = quote.lineItems.find((line) => line.name.startsWith('Pool shell'))
    expect(shell?.quantity).toBe(measurements.poolSurfaceArea)
    expect(shell?.total).toBeCloseTo(measurements.poolSurfaceArea * 95, 2)
  })

  it('forces the pump on, because every pool has one', () => {
    expect(quote.lineItems.some((line) => line.name.startsWith('Pump'))).toBe(true)
  })

  it('adds up', () => {
    const summed = quote.lineItems.reduce((total, line) => total + line.total, 0)
    expect(summed).toBeCloseTo(quote.subtotal, 2)
    expect(quote.subtotal + quote.taxAmount).toBeCloseTo(quote.total, 2)
  })
})

describe('a whole backyard drawn on day one', () => {
  const shapes = [
    pool(25, 16),
    stencil('spa', 'pool.spa', 7, 7),
    stencil('deck', 'deck.concrete', 30, 22),
    stencil('coping', 'deck.coping-strip', 25, 1.5),
    stencil('drain', 'deck.deco-drain', 30, 0.5),
    stencil('bench', 'feature.bench', 8, 1.5),
    stencil('light', 'feature.light', 0.5, 0.5),
    stencil('waterfall', 'water.waterfall', 5, 2),
  ]
  const measurements = computeMeasurements(shapes)
  const quote = computeQuote(BOOK, measurements, {}, { taxRatePct: 6 })

  it('leaves nothing on the drawing unpriced', () => {
    // Not "prices most of it". A category-wide gap is the engine saying the
    // book cannot price something the builder drew, and a brand new
    // organisation must never see one against the book we gave it.
    const holes = quote.unpriced.filter((entry) => entry.scope === 'category')
    expect(
      holes.map((hole) => `${hole.label}: ${hole.reason}`),
      'the starter book left drawn scope unpriced',
    ).toEqual([])
  })

  it('reports no collisions of its own making', () => {
    const collisions = quote.unpriced.filter((entry) => /would both bill/.test(entry.reason))
    expect(collisions.map((entry) => entry.reason)).toEqual([])
  })

  it('bills every scope the drawing put on the page', () => {
    const billed = new Set(quote.lineItems.map((line) => line.category))
    for (const category of ['POOL', 'SPA', 'DECK', 'COPING', 'DRAIN', 'BENCH', 'LIGHTING', 'WATER_FEATURE']) {
      expect(billed.has(category as never), `${category} was not billed`).toBe(true)
    }
  })
})

describe('what the starter book still refuses to invent', () => {
  it('quotes nothing at all for an empty canvas', () => {
    const quote = computeQuote(BOOK, computeMeasurements([]), {}, { taxRatePct: 6 })
    expect(quote.status).toBe('NOTHING_DRAWN')
    expect(quote.total).toBe(0)
  })

  it('does not bill a heater nobody asked for', () => {
    const quote = computeQuote(BOOK, computeMeasurements([pool(25, 16)]), {}, {})
    expect(quote.lineItems.some((line) => line.name.startsWith('Heater'))).toBe(false)
    expect(quote.lineItems.some((line) => line.name.startsWith('Salt'))).toBe(false)
  })

  it('bills the heater and only the heater when the heater is chosen', () => {
    const quote = computeQuote(
      BOOK,
      computeMeasurements([pool(25, 16)]),
      { heaterSelected: true },
      {},
    )
    expect(quote.lineItems.some((line) => line.name.startsWith('Heater'))).toBe(true)
    expect(quote.lineItems.some((line) => line.name.startsWith('Salt'))).toBe(false)
  })

  it('does not charge for a heater because the customer asked for salt', () => {
    // The defect this book must not reintroduce: every equipment line used to
    // be switched on by one flag meaning "a heater OR a salt system", so
    // somebody who ticked salt was billed $5,800 for a heater on a proposal
    // whose own equipment schedule said the heater was not included. Each
    // starter line names the option it belongs to, and this is what proves it.
    const quote = computeQuote(
      BOOK,
      computeMeasurements([pool(25, 16)]),
      { saltSystemSelected: true },
      {},
    )
    expect(quote.lineItems.some((line) => line.name.startsWith('Salt'))).toBe(true)
    expect(quote.lineItems.some((line) => line.name.startsWith('Heater'))).toBe(false)
  })
})
