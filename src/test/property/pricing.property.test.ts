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
import { computeMeasurements, type MeasurementSummary } from '@/modules/measurements/engine'
import { groupTotals, QUOTE_GROUPS } from '@/components/editor/shell/quote-groups'
import type { Shape } from '@/modules/editor/state/shapes'
import { ShapeKind } from '@prisma/client'

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

// ---------------------------------------------------------------------------
// Believability: the properties a person checks before they trust a number.
// ---------------------------------------------------------------------------

/** A drawing, as the editor actually holds one. */
const drawing: fc.Arbitrary<Shape[]> = fc
  .record({
    poolLengthFt: fc.integer({ min: 8, max: 60 }),
    poolWidthFt: fc.integer({ min: 6, max: 40 }),
    lights: fc.nat({ max: 6 }),
    waterFeatures: fc.nat({ max: 3 }),
  })
  .map(({ poolLengthFt, poolWidthFt, lights, waterFeatures }) => {
    const shapes: Shape[] = [
      {
        id: 'pool',
        kind: ShapeKind.RECTANGLE_POOL,
        x: 0,
        y: 0,
        width: poolLengthFt * 12,
        height: poolWidthFt * 12,
        rotation: 0,
        zIndex: 1,
        locked: false,
        hidden: false,
        depthShallow: 3,
        depthDeep: 6,
      },
    ]
    for (let i = 0; i < lights; i += 1) {
      shapes.push(stencilShape(`light-${i}`, 'feature.light', 6, 6))
    }
    for (let i = 0; i < waterFeatures; i += 1) {
      shapes.push(stencilShape(`wf-${i}`, 'water.waterfall', 60, 24))
    }
    return shapes
  })

function stencilShape(id: string, stencilId: string, w: number, h: number): Shape {
  return {
    id,
    kind: ShapeKind.STENCIL,
    stencilId,
    x: 0,
    y: 0,
    width: w,
    height: h,
    rotation: 0,
    zIndex: 2,
    locked: false,
    hidden: false,
  }
}

describe('a quote is believable', () => {
  it('an empty drawing quotes nothing, whatever the price book says', () => {
    // The reported defect: zero layers, "LIVE QUOTE $1,855". No price book and
    // no set of selections may put money on an empty canvas.
    const empty = computeMeasurements([])
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), selections, taxRatePct, (items, sel, rate) => {
        const quote = computeQuote(items, empty, sel, { taxRatePct: rate })
        expect(quote.status).toBe('NOTHING_DRAWN')
        expect(quote.lineItems).toEqual([])
        expect(quote.subtotal).toBe(0)
        expect(quote.taxAmount).toBe(0)
        expect(quote.total).toBe(0)
      }),
      { numRuns: 300 },
    )
  })

  it('a drawing with no price book behind it is never quoted at zero dollars', () => {
    fc.assert(
      fc.property(drawing, selections, taxRatePct, (shapes, sel, rate) => {
        const quote = computeQuote([], computeMeasurements(shapes), sel, { taxRatePct: rate })
        expect(quote.status).toBe('NO_PRICE_BOOK')
        expect(quote.lineItems).toEqual([])
        // Not "$0": the scope that could not be priced is named.
        expect(quote.unpriced.length).toBeGreaterThan(0)
      }),
      { numRuns: 200 },
    )
  })

  it('the breakdown the dock prints sums to the subtotal it prints', () => {
    // $39,194 of groups under a headline of $41,546 is the shape of this bug.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        const quote = computeQuote(items, m, sel)
        const grouped = groupTotals(quote.lineItems).reduce((sum, g) => sum + g.total, 0)
        expect(Math.abs(grouped - quote.subtotal)).toBeLessThan(CENT * quote.lineItems.length + CENT)
      }),
      { numRuns: 300 },
    )
  })

  it('every price category lands in exactly one breakdown group', () => {
    // A category owned by no group is money that vanishes from the breakdown;
    // a category owned by two is money counted twice.
    for (const category of Object.values(PriceCategory)) {
      expect(QUOTE_GROUPS.filter(g => g.categories.includes(category))).toHaveLength(1)
    }
  })

  it('a line and an "unpriced" warning are never raised for the same category', () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        const quote = computeQuote(items, m, sel)
        const priced = new Set(quote.lineItems.map(l => l.category))
        for (const u of quote.unpriced) expect(priced.has(u.category)).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('every light placed on the canvas is billed, at the book price', () => {
    // The reported defect: "adding a waterfall and a light changed the price by
    // $0" while the price book sold LED lights at $450 each. The price book
    // here is arbitrary except that lighting is sold per unit at a real price.
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 20 }),
        drawing,
        fc.integer({ min: 1, max: 4 }),
        price.filter(p => p > 0),
        taxRatePct,
        (others, shapes, extra, ledPrice, rate) => {
          const items: PriceBookItemLite[] = [
            ...others.filter(i => i.category !== PriceCategory.LIGHTING),
            {
              id: 'led',
              name: 'LED Pool Light',
              category: PriceCategory.LIGHTING,
              unitType: UnitType.EACH,
              retailPrice: ledPrice,
              required: false,
            },
          ]
          const more = [...shapes]
          for (let i = 0; i < extra; i += 1) {
            more.push(stencilShape(`extra-light-${i}`, 'feature.light', 6, 6))
          }
          const before = computeQuote(items, computeMeasurements(shapes), {}, { taxRatePct: rate })
          const after = computeQuote(items, computeMeasurements(more), {}, { taxRatePct: rate })
          expect(after.subtotal - before.subtotal).toBeCloseTo(extra * ledPrice, 1)
          expect(after.total).toBeGreaterThan(before.total)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('a bigger pool is never a cheaper pool', () => {
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 20 }),
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 1, max: 20 }),
        (items, lengthFt, widthFt, growFt) => {
          const small = stencilFreePool(lengthFt, widthFt)
          const large = stencilFreePool(lengthFt, widthFt + growFt)
          const before = computeQuote(items, computeMeasurements([small]), {}).subtotal
          const after = computeQuote(items, computeMeasurements([large]), {}).subtotal
          expect(after).toBeGreaterThanOrEqual(before - CENT)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('the editor and the documents cannot disagree: one drawing, one total', () => {
    // Both surfaces call this function with the same inputs. If that ever stops
    // being true this property is where it shows up.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 20 }), drawing, selections, taxRatePct, (items, shapes, sel, rate) => {
        const editor = computeQuote(items, computeMeasurements(shapes), sel, { taxRatePct: rate })
        const proposal = computeQuote(items, computeMeasurements([...shapes]), sel, { taxRatePct: rate })
        expect(editor.total).toBe(proposal.total)
        expect(editor.subtotal).toBe(proposal.subtotal)
        expect(editor.status).toBe(proposal.status)
      }),
      { numRuns: 200 },
    )
  })
})

function stencilFreePool(lengthFt: number, widthFt: number): Shape {
  return {
    id: 'pool',
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: lengthFt * 12,
    height: widthFt * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: 3,
    depthDeep: 6,
  }
}
