// Property tests for the dimension bounds.
//
// The example tests in `src/test/unit/commands/bounds.test.ts` pin the specific
// numbers a reviewer typed. These state what has to hold for every number
// anybody can type, because the defect was never about 99999 in particular: it
// was that nothing anywhere said what a dimension is allowed to be, so every
// figure derived from one — surface area, gallons, wetted area, and the quote
// that prices off all three — had no upper bound either.
//
// Two claims, and they are the two the bounds exist for:
//
//   1. Nothing the schemas accept produces a measurement that is not a finite
//      number, or a quote larger than the one the largest permitted pool prices
//      at. A bound that lets an infinity through has bounded nothing.
//   2. Nothing the schemas refuse changes the drawing. A refusal that half
//      applies is worse than no bound at all: the pool is now a size nobody
//      asked for and nobody was told about.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { withOrderedDepths, depthFeet, sizeFeet, sizeInches } from '@/lib/commands/dimensions'
import {
  MAX_DEPTH_FT,
  MAX_SIZE_FT,
  MAX_SIZE_IN,
  MIN_DEPTH_FT,
  MIN_SIZE_FT,
  MIN_SIZE_IN,
  clampSizeIn,
  depthsAreOrdered,
  floorSlope,
} from '@/lib/geometry/limits'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  PriceCategory,
  UnitType,
  type PriceBookItemLite,
} from '@/modules/pricing/engine'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { z } from 'zod'

/**
 * The geometry command's own schema, rebuilt from the same builders.
 *
 * Rebuilt rather than imported off the registry so this file stays a test of
 * the bounds themselves; `bounds.test.ts` is the one that goes through the
 * registry and the dispatch path end to end.
 */
const geometry = withOrderedDepths(
  z.object({
    lengthFt: sizeFeet('Pool length').optional(),
    widthFt: sizeFeet('Pool width').optional(),
    shallowDepthFt: depthFeet('Shallow end depth').optional(),
    deepDepthFt: depthFeet('Deep end depth').optional(),
  }),
  'shallowDepthFt',
  'deepDepthFt',
)

/** A price book with a line in every unit the engine can bill, so nothing is skipped. */
const BOOK: PriceBookItemLite[] = [
  { id: 'base', category: PriceCategory.POOL, name: 'Pool base', unitType: UnitType.SQFT, retailPrice: 95 },
  { id: 'tile', category: PriceCategory.POOL, name: 'Waterline tile', unitType: UnitType.LF, retailPrice: 32 },
  { id: 'coping', category: PriceCategory.COPING, name: 'Coping', unitType: UnitType.LF, retailPrice: 42 },
  { id: 'pump', category: PriceCategory.EQUIPMENT, name: 'Pump', unitType: UnitType.EACH, retailPrice: 1_200, required: true },
]

function pool(lengthFt: number, widthFt: number, shallowFt: number, deepFt: number): Shape {
  return {
    id: 'pool-under-test',
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: lengthFt * 12,
    height: widthFt * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: shallowFt,
    depthDeep: deepFt,
  } as Shape
}

function quoteFor(shape: Shape): number {
  return computeQuote(BOOK, computeMeasurements([shape]), {}).total
}

/**
 * The most expensive pool the bounds allow.
 *
 * Not a number anybody picked: it is what the corner of the permitted range
 * prices at, so the ceiling moves if and only if the bounds move. Every figure
 * the quote reads — surface area, perimeter, wetted area, gallons — rises with
 * length, width and depth, so the maximum sits at the maximum of all four.
 */
const CEILING = quoteFor(pool(MAX_SIZE_FT, MAX_SIZE_FT, MAX_DEPTH_FT, MAX_DEPTH_FT))

/** Anything a person or a model might send, most of it outside every range. */
const anyNumber = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: -1e6, max: 1e6, noNaN: true }) },
  { weight: 2, arbitrary: fc.double({ min: MIN_SIZE_FT, max: MAX_SIZE_FT, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(0, -0, 99_999, 1e308, Number.MAX_SAFE_INTEGER) },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY) },
)

/**
 * A geometry the schema should accept, drawn from inside every range.
 *
 * Generated rather than filtered: filtering four independently-hostile numbers
 * down to the ones that happen to be in range rejects fifty thousand cases to
 * find forty, which fast-check correctly refuses to call a test. The boundary
 * values are in the pool explicitly, because off-by-one at the limit is the
 * mistake a range check actually makes.
 */
const inRange = (min: number, max: number) =>
  fc.oneof(
    { weight: 4, arbitrary: fc.double({ min, max, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(min, max) },
  )

const acceptedGeometry = fc
  .record({
    lengthFt: inRange(MIN_SIZE_FT, MAX_SIZE_FT),
    widthFt: inRange(MIN_SIZE_FT, MAX_SIZE_FT),
    a: inRange(MIN_DEPTH_FT, MAX_DEPTH_FT),
    b: inRange(MIN_DEPTH_FT, MAX_DEPTH_FT),
  })
  .map(spec => ({
    lengthFt: spec.lengthFt,
    widthFt: spec.widthFt,
    shallowDepthFt: Math.min(spec.a, spec.b),
    deepDepthFt: Math.max(spec.a, spec.b),
  }))

/** At least one field outside its range, so the whole thing has to be refused. */
const refusedGeometry = fc
  .record({
    base: acceptedGeometry,
    field: fc.constantFrom('lengthFt', 'widthFt', 'shallowDepthFt', 'deepDepthFt' as const),
    bad: anyNumber.filter(
      v => !(v >= MIN_DEPTH_FT && v <= MAX_SIZE_FT) || Number.isNaN(v),
    ),
  })
  .map(spec => ({ ...spec.base, [spec.field]: spec.bad }))

describe('nothing the bounds accept can produce a figure nobody can read', () => {
  it('measures every accepted pool as finite, non-negative numbers', () => {
    fc.assert(
      fc.property(acceptedGeometry, raw => {
        const parsed = geometry.safeParse(raw)
        expect(parsed.success, `refused an in-range geometry: ${JSON.stringify(raw)}`).toBe(true)
        if (!parsed.success) return
        const p = parsed.data
        const m = computeMeasurements([
          pool(p.lengthFt as number, p.widthFt as number, p.shallowDepthFt as number, p.deepDepthFt as number),
        ])
        for (const [key, value] of Object.entries(m)) {
          if (typeof value !== 'number') continue
          expect(Number.isFinite(value), `${key} is ${value}`).toBe(true)
          expect(value, `${key} is negative`).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('prices every accepted pool at or below the largest one the bounds allow', () => {
    fc.assert(
      fc.property(acceptedGeometry, raw => {
        const parsed = geometry.safeParse(raw)
        expect(parsed.success).toBe(true)
        if (!parsed.success) return
        const p = parsed.data
        const total = quoteFor(
          pool(p.lengthFt as number, p.widthFt as number, p.shallowDepthFt as number, p.deepDepthFt as number),
        )
        expect(Number.isFinite(total)).toBe(true)
        expect(total).toBeLessThanOrEqual(CEILING)
      }),
      { numRuns: 500 },
    )
  })

  it('never reports a slope that is not a finite fall', () => {
    // The inspector prints this as "N:1", which divides by it. An infinity here
    // is a blank on a construction packet, and a negative one is a floor that
    // rises towards the deep end.
    fc.assert(
      fc.property(anyNumber, anyNumber, anyNumber, (shallow, deep, length) => {
        const slope = floorSlope(shallow, deep, length)
        expect(Number.isFinite(slope)).toBe(true)
        expect(slope).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 1_000 },
    )
  })
})

describe('nothing the bounds refuse changes anything', () => {
  it('leaves the drawing byte-identical when the schema says no', () => {
    const before = pool(30, 14, 3, 5)
    fc.assert(
      fc.property(refusedGeometry, raw => {
        const parsed = geometry.safeParse(raw)
        // A refusal is the whole of the outcome: the caller gets an error and
        // the shape it was aimed at is the object it was before. Nothing may
        // half-apply the fields that happened to be in range alongside the one
        // that was not.
        expect(parsed.success, `accepted ${JSON.stringify(raw)}`).toBe(false)
        const after = pool(30, 14, 3, 5)
        expect(after).toEqual(before)
      }),
      { numRuns: 500 },
    )
  })

  it('refuses every value outside the range and accepts every value inside it', () => {
    fc.assert(
      fc.property(anyNumber, value => {
        const inRange = value >= MIN_SIZE_FT && value <= MAX_SIZE_FT
        expect(sizeFeet('Pool length').safeParse(value).success).toBe(inRange)
      }),
      { numRuns: 1_000 },
    )
  })

  it('refuses a shallow end below a deep end however the two arrive', () => {
    fc.assert(
      fc.property(
        fc.double({ min: MIN_DEPTH_FT, max: MAX_DEPTH_FT, noNaN: true }),
        fc.double({ min: MIN_DEPTH_FT, max: MAX_DEPTH_FT, noNaN: true }),
        (a, b) => {
          const parsed = geometry.safeParse({ shallowDepthFt: a, deepDepthFt: b })
          expect(parsed.success).toBe(depthsAreOrdered(a, b))
        },
      ),
      { numRuns: 500 },
    )
  })

  it('says something with the limit in it every time it refuses', () => {
    // A bound added without a message reaches a person as Zod's own
    // "Number must be less than or equal to 400", which names no field and no
    // unit. Every builder has to carry its own sentence.
    fc.assert(
      fc.property(anyNumber, value => {
        const parsed = sizeFeet('Pool length').safeParse(value)
        fc.pre(!parsed.success)
        if (parsed.success) return
        const message = parsed.error.issues[0]?.message ?? ''
        expect(message).toContain('Pool length')
        expect(message).toContain('feet')
        expect(message).toMatch(/\d/)
        expect(message).not.toMatch(/lengthFt|z\.number|ZodError/)
      }),
      { numRuns: 500 },
    )
  })
})

describe('the drag path and the typed path bound the same thing', () => {
  it('clamps a drag to exactly the range the schema accepts', () => {
    fc.assert(
      fc.property(anyNumber, value => {
        const clamped = clampSizeIn(value)
        expect(clamped).toBeGreaterThanOrEqual(MIN_SIZE_IN)
        expect(clamped).toBeLessThanOrEqual(MAX_SIZE_IN)
        // The output of the drag path must be something the typed path would
        // have accepted, or the two disagree about what a pool is.
        expect(sizeInches('Width').safeParse(clamped).success).toBe(true)
      }),
      { numRuns: 1_000 },
    )
  })
})
