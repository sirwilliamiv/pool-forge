// The starter book's one promise, checked against every drawing rather than
// against the seven somebody thought of.
//
// "No holes" is easy to satisfy for a pool and a deck and get wrong for the
// backyard that has a spa, a bench, a deco drain and eighty yards of cut. The
// example tests price a handful of specific drawings; this checks the property
// that has to hold for all of them, which is where the gap between "we added a
// line for that" and "the engine can bill that line" actually shows up.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { computeQuote } from '@/modules/pricing/engine'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import { starterBookItems } from '@/test/fixtures/starter-book'

const BOOK = starterBookItems()

/**
 * A measurement a drawing can actually produce: nothing, or at least a tenth
 * of a foot.
 *
 * Not an arbitrary floor. The engine rounds every line quantity to two decimal
 * places, so a scope of 1e-9 linear feet is present according to `scopePresent`
 * and rounds to zero on the line, and the quote then reports it as a category
 * the book cannot price. That is an engine edge worth knowing about (noted in
 * the report) and it is not what this file is asking: whether the starter book
 * covers what somebody can draw. Half an inch of bench is not a drawing.
 */
const measure = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0.1, max: 20_000, noNaN: true, noDefaultInfinity: true }),
)
const depth = fc.double({ min: 0, max: 12, noNaN: true, noDefaultInfinity: true })

const measurements: fc.Arbitrary<MeasurementSummary> = fc.record({
  poolSurfaceArea: measure,
  poolPerimeter: measure,
  poolGallons: measure,
  poolWettedArea: measure,
  poolLengthFt: measure,
  poolWidthFt: measure,
  poolDepthShallow: depth,
  poolDepthDeep: depth,
  poolAvgDepth: depth,
  deckArea: measure,
  copingLinearFeet: measure,
  decoDrainLinearFeet: measure,
  benchLinearFeet: measure,
  featureCount: fc.nat({ max: 20 }),
  spaCount: fc.nat({ max: 4 }),
  lightCount: fc.nat({ max: 8 }),
  waterFeatureCount: fc.nat({ max: 6 }),
  hasPool: fc.boolean(),
  hasDeck: fc.boolean(),
  cutYards: measure,
  fillYards: measure,
  maxSlopePct: fc.double({ min: 0, max: 100, noNaN: true }),
})

const selections = fc.record({
  heaterSelected: fc.boolean(),
  saltSystemSelected: fc.boolean(),
  screenSelected: fc.boolean(),
  lightingQuantity: fc.nat({ max: 12 }),
})

describe('the starter book prices whatever gets drawn', () => {
  it('never reports a category it cannot price', () => {
    fc.assert(
      fc.property(measurements, selections, (m, sel) => {
        const quote = computeQuote(BOOK, m, sel)
        const holes = quote.unpriced.filter((entry) => entry.scope === 'category')
        expect(
          holes.map((hole) => hole.label),
          `unpriced scope against the starter book: ${JSON.stringify(holes)}`,
        ).toEqual([])
      }),
      { numRuns: 500 },
    )
  })

  it('never puts two of its own lines on one measurement', () => {
    // Two items in one category bill the same measured quantity twice, so the
    // engine suspends both and reports the pair. A new organisation must never
    // meet that against the book we handed them.
    fc.assert(
      fc.property(measurements, selections, (m, sel) => {
        const quote = computeQuote(BOOK, m, sel)
        const collisions = quote.unpriced.filter((entry) => /would both bill/.test(entry.reason))
        expect(collisions.map((entry) => entry.reason)).toEqual([])
      }),
      { numRuns: 500 },
    )
  })

  it('never says a drawing cannot be priced', () => {
    // NO_PRICE_BOOK is the state this whole module exists to abolish: it is
    // what twenty one projects in the dev database report today.
    fc.assert(
      fc.property(measurements, selections, (m, sel) => {
        expect(computeQuote(BOOK, m, sel).status).not.toBe('NO_PRICE_BOOK')
      }),
      { numRuns: 300 },
    )
  })

  it('charges money for anything worth drawing', () => {
    fc.assert(
      fc.property(measurements, selections, (m, sel) => {
        const quote = computeQuote(BOOK, m, sel)
        if (quote.status !== 'PRICED') return
        expect(quote.subtotal).toBeGreaterThan(0)
      }),
      { numRuns: 300 },
    )
  })
})
