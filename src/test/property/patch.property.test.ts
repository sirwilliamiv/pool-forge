// Property tests for the import review gate.
//
// This produced the nastiest bug in the project. `touchedPaths` walked two
// levels, so a correction to `features.0.count` was recorded as `features`,
// which never matched the path the gate was checking. The gate therefore
// blocked apply forever: the user corrected the field, watched it stay blocked,
// corrected it again, and nothing in the suite objected.
//
// The correct behaviour is a pair of opposing invariants, which is exactly the
// shape property tests are for: a correction must cover the field it corrected,
// and must NOT cover the fields it did not. Over-covering silently rubber-stamps
// a low-confidence value nobody looked at; under-covering blocks the flow.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { pathCoveredBy } from '@/modules/imports/intent'
import { touchedPaths } from '@/modules/imports/patch'
import type { DesignIntentPatch } from '@/modules/imports/patch'

/** A leaf value: anything that is not a partial edit of an object. */
const leaf = fc.oneof(
  fc.integer({ min: -100, max: 100 }),
  fc.string({ maxLength: 6 }),
  fc.boolean(),
  fc.constant(null),
)

/** A pool section, the common case: a partial edit of scalar fields. */
const poolPatch = fc.record(
  {
    lengthFt: fc.option(fc.integer({ min: 5, max: 60 }), { nil: undefined }),
    widthFt: fc.option(fc.integer({ min: 5, max: 40 }), { nil: undefined }),
    depthShallowFt: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
    depthDeepFt: fc.option(fc.integer({ min: 3, max: 12 }), { nil: undefined }),
  },
  { requiredKeys: [] },
)

describe('touchedPaths', () => {
  it('covers every field the correction actually changed', () => {
    // The regression the two-level walk failed. Correcting a field must satisfy
    // the gate for that field, at any depth.
    fc.assert(
      fc.property(
        fc.dictionary(fc.constantFrom('count', 'kind', 'sizeFt'), leaf, { minKeys: 1, maxKeys: 3 }),
        entry => {
          const patch = { features: [entry] } as unknown as DesignIntentPatch
          const touched = touchedPaths(patch)
          for (const key of Object.keys(entry)) {
            const field = `features.0.${key}`
            expect(
              touched.some(path => pathCoveredBy(path, field)),
              `${field} stays blocked after being corrected`,
            ).toBe(true)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('does not review a sibling nobody touched', () => {
    // The opposite failure, and the worse one: correcting the length must not
    // silently mark the width reviewed. That rubber-stamps a low-confidence
    // number straight into a customer's drawing.
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 60 }), lengthFt => {
        const touched = touchedPaths({ pool: { lengthFt } } as unknown as DesignIntentPatch)
        expect(touched.some(path => pathCoveredBy(path, 'pool.lengthFt'))).toBe(true)
        for (const sibling of ['pool.widthFt', 'pool.depthDeepFt', 'pool.shapeFamily']) {
          expect(
            touched.some(path => pathCoveredBy(path, sibling)),
            `${sibling} was reviewed without being touched`,
          ).toBe(false)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('records exactly the fields present in a partial section', () => {
    fc.assert(
      fc.property(poolPatch, pool => {
        const provided = Object.entries(pool)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => `pool.${key}`)
        const touched = touchedPaths({ pool } as unknown as DesignIntentPatch)
        const poolPaths = touched.filter(path => path.startsWith('pool'))
        expect(poolPaths.sort()).toEqual(provided.sort())
      }),
      { numRuns: 300 },
    )
  })

  it('lets a whole-array replacement cover everything inside it', () => {
    // Replacing the feature list is a review of that list. A path per element
    // would be unreachable, since the reviewer edited the list as a whole.
    fc.assert(
      fc.property(
        fc.array(fc.record({ count: fc.integer({ min: 0, max: 5 }) }), { minLength: 1, maxLength: 4 }),
        features => {
          const touched = touchedPaths({ features } as unknown as DesignIntentPatch)
          for (let index = 0; index < features.length; index++) {
            expect(touched.some(path => pathCoveredBy(path, `features.${index}.count`))).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('reports nothing for an empty patch', () => {
    // Submitting the form unchanged must review nothing at all.
    expect(touchedPaths({} as DesignIntentPatch)).toEqual([])
  })

  it('ignores keys explicitly set to undefined', () => {
    // `exactOptionalPropertyTypes` is on, but a patch arriving over the wire can
    // still carry an undefined value. It means "not edited", not "cleared".
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 60 }), lengthFt => {
        const touched = touchedPaths({
          pool: { lengthFt, widthFt: undefined },
        } as unknown as DesignIntentPatch)
        expect(touched).toEqual(['pool.lengthFt'])
      }),
      { numRuns: 100 },
    )
  })

  it('never returns a duplicate or an empty path', () => {
    fc.assert(
      fc.property(poolPatch, pool => {
        const touched = touchedPaths({ pool } as unknown as DesignIntentPatch)
        expect(new Set(touched).size).toBe(touched.length)
        for (const path of touched) expect(path.length).toBeGreaterThan(0)
      }),
      { numRuns: 200 },
    )
  })

  it('is monotone: adding a correction never un-reviews a field', () => {
    // Correcting one more thing cannot make the gate stricter than it was.
    fc.assert(
      fc.property(poolPatch, fc.integer({ min: 1, max: 12 }), (pool, depthDeepFt) => {
        const before = touchedPaths({ pool } as unknown as DesignIntentPatch)
        const after = touchedPaths({ pool: { ...pool, depthDeepFt } } as unknown as DesignIntentPatch)
        for (const path of before) {
          expect(after.some(candidate => pathCoveredBy(candidate, path))).toBe(true)
        }
      }),
      { numRuns: 300 },
    )
  })
})

describe('pathCoveredBy', () => {
  it('is reflexive', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), path => {
        expect(pathCoveredBy(path, path)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('matches on segment boundaries, not on characters', () => {
    // `pool.length` must not cover `pool.lengthFt`. A prefix test without the
    // dot would review a different field than the one that was corrected.
    expect(pathCoveredBy('pool.length', 'pool.lengthFt')).toBe(false)
    expect(pathCoveredBy('pool', 'poolside.x')).toBe(false)
    expect(pathCoveredBy('pool', 'pool.lengthFt')).toBe(true)
  })

  it('covers descendants but never ancestors', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 3 }),
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 2 }),
        (head, tail) => {
          const parent = head.join('.')
          const child = [...head, ...tail].join('.')
          expect(pathCoveredBy(parent, child)).toBe(true)
          expect(pathCoveredBy(child, parent)).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })
})
