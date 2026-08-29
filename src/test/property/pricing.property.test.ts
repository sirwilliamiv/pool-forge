// Property tests for the quote engine.
//
// The example tests check that specific pools price correctly. These check the
// arithmetic that has to hold for *every* pool, which is where money bugs live:
// a total that does not equal its parts is the one defect a customer finds
// before anyone else does.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  ADDITIVE_CATEGORIES as ADDITIVE,
  computeQuote,
  normalizeOptionKey,
  PriceCategory,
  PRICING_OPTIONS,
  UnitType,
} from '@/modules/pricing/engine'
import type {
  PriceBookItemLite,
  PricingOptionKey,
  PricingSelections,
  ProjectLineItemLite,
} from '@/modules/pricing/engine'
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
  // Most rows carry no key, which is what every existing book looks like.
  optionKey: fc.constantFrom(null, null, null, ...PRICING_OPTIONS),
})

/** An amount a builder put on one job by hand, as the form lets them enter it. */
const lineItem: fc.Arbitrary<ProjectLineItemLite> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }).map(s => `line-${s}`),
  name: fc.string({ minLength: 1, maxLength: 24 }),
  category: fc.constantFrom(...CATEGORIES),
  unitType: fc.constantFrom(...UNIT_TYPES),
  // Three decimals, positive: the column's precision, and the command refuses
  // anything at or below zero.
  quantity: fc.integer({ min: 1, max: 500_000 }).map(n => n / 1000),
  unitPrice: price,
})

/**
 * Several of them on one job, with distinct ids.
 *
 * `ProjectLineItem.id` is a primary key, so two rows on one project cannot
 * share one. Generating collisions would test a state the database forbids and
 * would tell us nothing about the money.
 */
const lineItems = (maxLength: number): fc.Arbitrary<ProjectLineItemLite[]> =>
  fc
    .array(lineItem, { maxLength })
    .map(list => list.map((entry, i) => ({ ...entry, id: `${entry.id}-${i}` })))

/**
 * A price book, with distinct item ids.
 *
 * `PriceBookItem.id` is a primary key, so one book cannot hold two rows under
 * one id. A bare `fc.array(item)` can, and every assertion in this file that
 * looks an item up by id — its unit type, its option key — silently reads the
 * wrong row when it does. That is a state the database forbids, so generating
 * it tests nothing and hides real failures behind fake ones.
 */
const book = (maxLength: number): fc.Arbitrary<PriceBookItemLite[]> =>
  fc
    .array(item, { maxLength })
    .map(list => list.map((entry, i) => ({ ...entry, id: `${entry.id}-${i}` })))

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

/** Which options a customer ticked, as a plain set. */
function chosenOptions(sel: {
  heaterSelected?: boolean
  saltSystemSelected?: boolean
  screenSelected?: boolean
}): ReadonlySet<PricingOptionKey> {
  const out = new Set<PricingOptionKey>()
  if (sel.heaterSelected) out.add('heater')
  if (sel.saltSystemSelected) out.add('salt')
  if (sel.screenSelected) out.add('screen')
  return out
}

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

  it('never bills two items for one measurement', () => {
    // The invariant the competing-items rule exists for, stated directly. Two
    // deck lines in a book billed 1,540 square feet of concrete for a 770
    // square foot deck, and every other symptom followed from that.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        const unitOf = new Map(items.map(i => [i.id, i.unitType]))
        const seen = new Set<string>()
        for (const line of computeQuote(items, m, sel).lineItems) {
          if (ADDITIVE.has(line.category)) continue
          const key = `${line.category}:${unitOf.get(line.itemId) ?? ''}`
          expect(seen.has(key), `${key} billed twice, second was ${line.name}`).toBe(false)
          seen.add(key)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('adding an item never lowers the subtotal, unless it competes with one already there', () => {
    // Monotonicity: a price book with more in it cannot quote less. A quantity
    // rule that subtracted somewhere would show up here and nowhere else.
    //
    // The exception is not a weakening, it is the point. This held
    // unconditionally before, and it held *because* two deck items both billed
    // the whole deck: more items meant more money precisely because the same
    // ground was charged twice. An item that competes with one already in the
    // book now suspends both, or loses to a default, and either legitimately
    // lowers the subtotal.
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 20 }),
        item,
        measurements,
        selections,
        (items, extra, m, sel) => {
          // Distinct id, or the extra collides with an existing line.
          const added = { ...extra, id: `${extra.id}-extra` }
          const competes =
            !ADDITIVE.has(added.category) &&
            items.some(o => o.category === added.category && o.unitType === added.unitType)
          if (competes) return

          const before = computeQuote(items, m, sel).subtotal
          const after = computeQuote([...items, added], m, sel).subtotal
          expect(after).toBeGreaterThanOrEqual(before - CENT)
        },
      ),
      { numRuns: 300 },
    )
  })})

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

  it('never says a category is unpriced while billing for it', () => {
    // The original wording was "a line and an unpriced warning are never raised
    // for the same category", which was the same thing until competing items
    // existed. A category can now hold a priced line in one unit and two items
    // fighting over another: a pool base by the square foot billing, and two
    // per-linear-foot pool lines suspended. Both statements are true and the
    // builder needs both.
    //
    // Which of the two an entry is making is now written on the entry itself
    // rather than matched out of its wording, so this reads the claim instead
    // of guessing at it. A 'detail' entry names one thing inside a category
    // that is otherwise priced — a finish, a collision, an option the book
    // cannot bill. A 'category' entry says the whole category is unpriced, and
    // that is the one that must never sit beside a billing line.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        const quote = computeQuote(items, m, sel)
        const priced = new Set(quote.lineItems.map(l => l.category))
        for (const u of quote.unpriced) {
          if (u.scope === 'detail') continue
          expect(priced.has(u.category)).toBe(false)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('a detail entry always names the specific thing it is about', () => {
    // The escape hatch above is only safe if 'detail' means something. An entry
    // that claims to be about one thing has to say which thing, or it is a
    // category-wide silence wearing the wrong label.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 40 }), measurements, selections, (items, m, sel) => {
        for (const u of computeQuote(items, m, sel).unpriced) {
          expect(u.label.trim().length).toBeGreaterThan(0)
          expect(u.reason.trim().length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 200 },
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

// ---------------------------------------------------------------------------
// The two money bugs, as invariants rather than examples.
//
// Both were found by a person driving the app, and both had the same shape: a
// figure on a customer's proposal that the customer could not reconcile with
// what they had asked for. An example test pins one book and one pool; these
// hold for every book and every pool the app can produce.
// ---------------------------------------------------------------------------

describe('an option bills only what the customer asked for', () => {
  it('an item that names an option never bills unless that option is chosen', () => {
    // Tick salt, get billed for a heater. One boolean meaning "heater OR salt"
    // drove every EQUIPMENT item, so a book holding both billed both whichever
    // the customer picked. A line that names its option is on the job when that
    // option is on the job, and at no other time.
    fc.assert(
      fc.property(book(40), measurements, selections, (items, m, sel) => {
        const keyOf = new Map(items.map(i => [i.id, normalizeOptionKey(i.optionKey)]))
        const gated = new Set(items.filter(i => i.optionKey != null).map(i => i.id))
        const chosen = chosenOptions(sel)
        for (const line of computeQuote(items, m, sel).lineItems) {
          if (!gated.has(line.itemId)) continue
          const key = keyOf.get(line.itemId)
          expect(
            key !== null && key !== undefined && chosen.has(key),
            `${line.name} billed ${line.total} for an option the customer did not choose`,
          ).toBe(true)
        }
      }),
      { numRuns: 400 },
    )
  })

  it('turning an option off never costs more than leaving it on', () => {
    // The direction of the harm. A customer who declines a heater must never
    // find the quote has gone up.
    //
    // Stated over books where no two items compete for one measurement, which
    // is every book that is not already broken. The exception is real and it is
    // not a defect: two deck items with nothing to separate them suspend each
    // other and the category bills nothing, and if one of them happens to be
    // keyed to an option, switching that option off leaves the other one
    // unopposed and billing. The quote says so both times — "two items compete"
    // is on the unpriced list — and the collision is the thing to fix, not this.
    fc.assert(
      fc.property(
        book(30),
        measurements,
        selections,
        fc.constantFrom(...PRICING_OPTIONS),
        (items, m, sel, key) => {
          const seen = new Set<string>()
          for (const i of items) {
            if (ADDITIVE.has(i.category)) continue
            const slot = `${i.category}:${i.unitType}`
            if (seen.has(slot)) return // competing items: see above
            seen.add(slot)
          }
          const field =
            key === 'heater'
              ? 'heaterSelected'
              : key === 'salt'
                ? 'saltSystemSelected'
                : 'screenSelected'
          const on: PricingSelections = { ...sel, [field]: true }
          const off: PricingSelections = { ...sel, [field]: false }
          expect(computeQuote(items, m, off).subtotal).toBeLessThanOrEqual(
            computeQuote(items, m, on).subtotal + CENT,
          )
        },
      ),
      { numRuns: 400 },
    )
  })

  it('a book with no option keys in it prices exactly as it did before', () => {
    // Backwards compatibility as a property, not a promise. Every book in the
    // database carries a null in this column, and quietly changing what any of
    // them charges would be a money bug of its own.
    fc.assert(
      fc.property(book(30), measurements, selections, (items, m, sel) => {
        const ungated = items.map(i => ({ ...i, optionKey: null }))
        const quote = computeQuote(ungated, m, sel)
        const equipment = quote.lineItems.filter(l => l.category === PriceCategory.EQUIPMENT)
        // The old rule, stated directly: an equipment line bills when either
        // option is on, and never otherwise.
        if (!sel.heaterSelected && !sel.saltSystemSelected) {
          for (const line of equipment) {
            const source = ungated.find(i => i.id === line.itemId)
            expect(source?.required, `${line.name} billed with no option chosen`).toBe(true)
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  it('a cage is never billed by the deck it stands over', () => {
    // The reviewer's second finding. A screen enclosure priced per square foot
    // was handed `deckArea`, which is not the cage's footprint (it spans the
    // pool too) and not the panel area a screen contractor charges for. Nothing
    // in the drawing measures a cage, so an area or linear cage line bills
    // nothing at all rather than a plausible wrong number.
    fc.assert(
      fc.property(book(30), measurements, selections, (items, m, sel) => {
        const unitOf = new Map(items.map(i => [i.id, i.unitType]))
        for (const line of computeQuote(items, m, sel).lineItems) {
          if (line.category !== PriceCategory.SCREEN) continue
          const unit = unitOf.get(line.itemId)
          expect(
            unit === UnitType.EACH || unit === UnitType.LUMP || unit === UnitType.HOUR,
            `a ${String(unit)} cage line billed ${line.quantity}`,
          ).toBe(true)
          expect(line.quantity).toBe(1)
        }
      }),
      { numRuns: 300 },
    )
  })
})

describe('money put on a job by hand is money on the quote', () => {
  it('a line item contributes exactly its quantity times its price', () => {
    // The whole of bug 2b in one sentence. Five categories returned zero and
    // the quote dropped the line, so "Paver retaining wall $9,400" was accepted
    // and never charged.
    fc.assert(
      fc.property(
        book(20),
        lineItems(8).filter(list => list.length > 0),
        measurements,
        selections,
        (items, added, m, sel) => {
          const withSel: PricingSelections = { ...sel, projectLineItems: added }
          const quote = computeQuote(items, m, withSel)
          for (const entry of added) {
            const line = quote.lineItems.find(l => l.itemId === entry.id)
            expect(line, `${entry.name} never reached the quote`).toBeDefined()
            expect(Math.abs((line?.total ?? 0) - entry.quantity * entry.unitPrice)).toBeLessThan(
              CENT,
            )
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('adding one to a job raises the subtotal by exactly its own total', () => {
    // Nothing measured, so nothing to collide with and nothing to displace.
    fc.assert(
      fc.property(
        book(20),
        lineItem,
        measurements,
        selections,
        (items, added, m, sel) => {
          const before = computeQuote(items, m, sel)
          const after = computeQuote(items, m, { ...sel, projectLineItems: [added] })
          const expected = Math.round(added.quantity * added.unitPrice * 100) / 100
          expect(Math.abs(after.subtotal - before.subtotal - expected)).toBeLessThan(CENT * 2)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('no category is silently free: every category that can hold scope can bill it', () => {
    // The bar. A category that accepts a price and can never charge it is the
    // defect; every one of the sixteen has to be reachable, either from the
    // drawing or from a hand-entered line on the job.
    fc.assert(
      fc.property(
        lineItem,
        measurements,
        selections,
        (added, m, sel) => {
          const quote = computeQuote([], m, { ...sel, projectLineItems: [added] })
          expect(quote.status).toBe('PRICED')
          expect(quote.lineItems.some(l => l.category === added.category)).toBe(true)
        },
      ),
      { numRuns: 300 },
    )
    // Stated over the whole enum as well, so a category added later cannot slip
    // through by never being generated.
    for (const category of Object.values(PriceCategory)) {
      const added: ProjectLineItemLite = {
        id: `probe-${category}`,
        category,
        name: `${category} probe`,
        unitType: UnitType.LUMP,
        quantity: 1,
        unitPrice: 1234,
      }
      const quote = computeQuote([], computeMeasurements([]), { projectLineItems: [added] })
      expect(quote.subtotal, `${category} cannot be billed at all`).toBe(1234)
    }
  })

  it('anything that bills nothing is named rather than dropped', () => {
    // No silent zeros. A hand-entered line at zero quantity is the exact shape
    // of the original complaint, so it is reported instead of vanishing.
    fc.assert(
      fc.property(
        book(20),
        lineItem,
        measurements,
        selections,
        (items, added, m, sel) => {
          const zeroed = { ...added, quantity: 0 }
          const quote = computeQuote(items, m, { ...sel, projectLineItems: [zeroed] })
          expect(quote.lineItems.some(l => l.itemId === zeroed.id)).toBe(false)
          expect(
            quote.unpriced.some(u => u.label === zeroed.name),
            `${zeroed.name} billed nothing and said nothing`,
          ).toBe(true)
        },
      ),
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
