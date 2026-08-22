// Property tests for the quote engine.
//
// The example tests check that specific pools price correctly. These check the
// arithmetic that has to hold for *every* pool, which is where money bugs live:
// a total that does not equal its parts is the one defect a customer finds
// before anyone else does.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { computeQuote, PriceCategory, UnitType } from '@/modules/pricing/engine'
import type { PriceBookItemLite } from '@/modules/pricing/engine'
import type { MeasurementSummary } from '@/modules/measurements/engine'

const CATEGORIES = Object.values(PriceCategory)
const UNIT_TYPES = Object.values(UnitType)

/** Money, as a price book actually holds it: two decimals, non-negative. */
const price = fc
  .integer({ min: 0, max: 5_000_00 })
  .map(cents => Math.round(cents) / 100)

const item: fc.Arbitrary<PriceBookItemLite> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  name: fc.string({ minLength: 1, maxLength: 24 }),
  category: fc.constantFrom(...CATEGORIES),
  unitType: fc.constantFrom(...UNIT_TYPES),
  retailPrice: price,
  required: fc.boolean(),
})

const measure = fc.double({ min: 0, max: 20_000, noNaN: true, noDefaultInfinity: true })

const measurements: fc.Arbitrary<MeasurementSummary> = fc.record({
  poolSurfaceArea: measure,
  poolPerimeter: measure,
  poolGallons: measure,
  poolWettedArea: measure,
  poolLengthFt: measure,
  poolWidthFt: measure,
  poolDepthShallow: fc.double({ min: 0, max: 12, noNaN: true }),
  poolDepthDeep: fc.double({ min: 0, max: 12, noNaN: true }),
  poolAvgDepth: fc.double({ min: 0, max: 12, noNaN: true }),
  deckArea: measure,
  copingLinearFeet: measure,
  decoDrainLinearFeet: measure,
  benchLinearFeet: measure,
  featureCount: fc.nat({ max: 20 }),
  spaCount: fc.nat({ max: 4 }),
  hasPool: fc.boolean(),
  hasDeck: fc.boolean(),
})

const selections = fc.record({
  heaterSelected: fc.boolean(),
  saltSystemSelected: fc.boolean(),
  screenSelected: fc.boolean(),
  lightingQuantity: fc.nat({ max: 12 }),
})

const taxRatePct = fc.double({ min: 0, max: 15, noNaN: true })

/** Cent-level tolerance: every figure is rounded to two places on the way out. */
const CENT = 0.011

describe('computeQuote invariants', () => {
  it('the subtotal is the sum of the lines', () => {
    // The single number a customer can check by hand.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        const quote = computeQuote(items, m, sel)
        const summed = quote.lineItems.reduce((total, line) => total + line.total, 0)
        expect(Math.abs(quote.subtotal - summed)).toBeLessThan(CENT)
      }),
      { numRuns: 300 },
    )
  })

  it('the total is the subtotal plus the tax, always', () => {
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 40 }),
        measurements,
        selections,
        taxRatePct,
        (items, m, sel, rate) => {
          const quote = computeQuote(items, m, sel, { taxRatePct: rate })
          expect(Math.abs(quote.total - (quote.subtotal + quote.taxAmount))).toBeLessThan(CENT)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('every line total is its own quantity times its own unit price', () => {
    // Printed line totals have to survive a customer multiplying them out.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        for (const line of computeQuote(items, m, sel).lineItems) {
          expect(Math.abs(line.total - line.quantity * line.unitPrice)).toBeLessThan(CENT)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('never produces a negative figure', () => {
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 40 }),
        measurements,
        selections,
        taxRatePct,
        (items, m, sel, rate) => {
          const quote = computeQuote(items, m, sel, { taxRatePct: rate })
          expect(quote.subtotal).toBeGreaterThanOrEqual(0)
          expect(quote.taxAmount).toBeGreaterThanOrEqual(0)
          expect(quote.total).toBeGreaterThanOrEqual(0)
          for (const line of quote.lineItems) expect(line.total).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('a negative tax rate cannot discount the job', () => {
    // The rate comes from org settings, so a typo must not become a refund.
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 20 }),
        measurements,
        fc.double({ min: -50, max: -0.01, noNaN: true }),
        (items, m, rate) => {
          const quote = computeQuote(items, m, {}, { taxRatePct: rate })
          expect(quote.taxAmount).toBe(0)
          expect(quote.total).toBeCloseTo(quote.subtotal, 2)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('drops nothing silently: every published line has a positive quantity', () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        for (const line of computeQuote(items, m, sel).lineItems) {
          expect(line.quantity).toBeGreaterThan(0)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('is deterministic', () => {
    // Two reads of the same design must not produce two totals: the editor dock
    // and the proposal compute this separately.
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 30 }),
        measurements,
        selections,
        taxRatePct,
        (items, m, sel, rate) => {
          const a = computeQuote(items, m, sel, { taxRatePct: rate })
          const b = computeQuote(items, m, sel, { taxRatePct: rate })
          expect(a).toEqual(b)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('adding an item never lowers the subtotal', () => {
    // Monotonicity: a price book with more in it cannot quote less. A quantity
    // rule that subtracted somewhere would show up here and nowhere else.
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 20 }),
        item,
        measurements,
        selections,
        (items, extra, m, sel) => {
          // Distinct id, or the extra collides with an existing line.
          const added = { ...extra, id: `${extra.id}-extra` }
          const before = computeQuote(items, m, sel).subtotal
          const after = computeQuote([...items, added], m, sel).subtotal
          expect(after).toBeGreaterThanOrEqual(before - CENT)
        },
      ),
      { numRuns: 300 },
    )
  })
})
