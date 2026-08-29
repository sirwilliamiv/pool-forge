// Property tests for the public studio.
//
// The example tests check that a family-sized rectangle prices sensibly. These
// check what has to hold for *every* backyard somebody can build, which matters
// more here than anywhere else in the product: this is the one screen where a
// number is shown to a member of the public with nobody from the company in the
// room to notice it is wrong.
//
// Four invariants, and each one is a defect this design could plausibly have:
//
//   1. The range contains the figure it was built from, always.
//   2. Adding scope never makes a pool cheaper.
//   3. A share link round-trips, so nobody opens a different pool than the one
//      that was sent.
//   4. Any string at all decodes to a valid config, because the code arrives
//      from a URL.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  BUDGETS,
  DECK_MATERIALS,
  DECK_SIZES,
  DEPTH_PROFILES,
  INTERIOR_FINISHES,
  MAX_LIGHTS,
  MAX_WATER_FEATURES,
  POOL_SHAPES,
  POOL_SIZES,
} from '@/modules/dream/catalog'
import { dreamConfigSchema, type DreamConfig } from '@/modules/dream/config'
import { measureDream } from '@/modules/dream/measure'
import { priceDream } from '@/modules/dream/pricing'
import { decodeDream, encodeDream } from '@/modules/dream/share'
import { ballparkSpread, IRREDUCIBLE_SPREAD, MAX_SPREAD } from '@/modules/dream/spread'
import { layoutYard } from '@/modules/dream/yard'

const ids = (list: readonly { id: string }[]) => fc.constantFrom(...list.map((o) => o.id))

const anyConfig: fc.Arbitrary<DreamConfig> = fc.record({
  shape: ids(POOL_SHAPES),
  size: ids(POOL_SIZES),
  depth: ids(DEPTH_PROFILES),
  finish: ids(INTERIOR_FINISHES),
  deckSize: ids(DECK_SIZES),
  deckMaterial: ids(DECK_MATERIALS),
  budget: ids(BUDGETS),
  spa: fc.boolean(),
  heater: fc.boolean(),
  saltwater: fc.boolean(),
  screenEnclosure: fc.boolean(),
  waterFeatures: fc.integer({ min: 0, max: MAX_WATER_FEATURES }),
  extraLights: fc.integer({ min: 0, max: MAX_LIGHTS }),
}) as fc.Arbitrary<DreamConfig>

describe('every backyard prices to a range that means something', () => {
  it('never quotes a range that excludes its own mid figure', () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        const ballpark = priceDream(config)
        expect(ballpark.low).toBeLessThanOrEqual(ballpark.mid)
        expect(ballpark.mid).toBeLessThanOrEqual(ballpark.high)
      }),
    )
  })

  it('never quotes a free pool', () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        // The smallest thing this catalogue can build is a plunge pool with a
        // walkway, and that is still a five-figure job. A ballpark in the
        // hundreds would mean the engine had stopped billing a category.
        expect(priceDream(config).low).toBeGreaterThan(10_000)
      }),
    )
  })

  it('keeps the spread inside the bounds the module claims for it', () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        const spread = ballparkSpread(config)
        expect(spread).toBeGreaterThanOrEqual(IRREDUCIBLE_SPREAD)
        expect(spread).toBeLessThanOrEqual(MAX_SPREAD)
      }),
    )
  })
})

describe('adding something never takes money off', () => {
  /**
   * The invariant that protects the whole page.
   *
   * A configurator where ticking a box lowers the total is not merely wrong,
   * it is the specific wrongness a visitor screenshots. Every one of these
   * switches adds real scope, so every one of them must add money.
   */
  const additions: ReadonlyArray<[string, (c: DreamConfig) => DreamConfig]> = [
    ['a spa', (c) => ({ ...c, spa: true })],
    ['a heater', (c) => ({ ...c, heater: true })],
    ['salt', (c) => ({ ...c, saltwater: true })],
    ['a screen enclosure', (c) => ({ ...c, screenEnclosure: true })],
    ['a water feature', (c) => ({ ...c, waterFeatures: Math.min(MAX_WATER_FEATURES, c.waterFeatures + 1) })],
    ['a light', (c) => ({ ...c, extraLights: Math.min(MAX_LIGHTS, c.extraLights + 1) })],
  ]

  for (const [name, add] of additions) {
    it(`adding ${name} never lowers the ballpark`, () => {
      fc.assert(
        fc.property(anyConfig, (config) => {
          const before = priceDream(config).mid
          const after = priceDream(add(config)).mid
          expect(after).toBeGreaterThanOrEqual(before)
        }),
      )
    })
  }

  it('a bigger pool is never cheaper than a smaller one, all else equal', () => {
    const ascending = POOL_SIZES.map((s) => s.id)
    fc.assert(
      fc.property(anyConfig, fc.integer({ min: 0, max: ascending.length - 2 }), (config, i) => {
        const smaller = ascending[i]
        const larger = ascending[i + 1]
        if (smaller === undefined || larger === undefined) return
        const small = priceDream({ ...config, size: smaller }).mid
        const large = priceDream({ ...config, size: larger }).mid
        expect(large).toBeGreaterThanOrEqual(small)
      }),
    )
  })

  it('a richer interior finish is never cheaper than a plainer one', () => {
    const ascending = INTERIOR_FINISHES.map((f) => f.id)
    fc.assert(
      fc.property(anyConfig, fc.integer({ min: 0, max: ascending.length - 2 }), (config, i) => {
        const plainer = ascending[i]
        const richer = ascending[i + 1]
        if (plainer === undefined || richer === undefined) return
        expect(priceDream({ ...config, finish: richer }).mid).toBeGreaterThanOrEqual(
          priceDream({ ...config, finish: plainer }).mid,
        )
      }),
    )
  })
})

describe('a shared link opens the pool that was shared', () => {
  it('round-trips every config', () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        expect(decodeDream(encodeDream(config))).toEqual(config)
      }),
    )
  })

  it('produces the same code for the same design every time', () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        expect(encodeDream(config)).toBe(encodeDream({ ...config }))
      }),
    )
  })

  it('never returns anything the schema would refuse, whatever the URL says', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (code) => {
        expect(() => dreamConfigSchema.parse(decodeDream(code))).not.toThrow()
      }),
    )
  })
})

describe('every backyard can be measured and drawn', () => {
  it('measures a pool with water in it, whatever was chosen', () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        const m = measureDream(config)
        expect(m.poolSurfaceArea).toBeGreaterThan(0)
        expect(m.poolPerimeter).toBeGreaterThan(0)
        expect(m.poolGallons).toBeGreaterThan(0)
        expect(m.hasPool).toBe(true)
        // A depth that reads deeper at the shallow end is a sign the profile
        // was wired backwards, which no test of a single pool would catch.
        expect(m.poolDepthDeep).toBeGreaterThanOrEqual(m.poolDepthShallow)
      }),
    )
  })

  it('lays out a yard that contains its own pool', () => {
    fc.assert(
      fc.property(anyConfig, (config) => {
        const layout = layoutYard(config, measureDream(config).lightCount)
        // The paving has to surround the water. A pool hanging off the deck is
        // the kind of drawing bug that is obvious in one screenshot and
        // invisible in a unit test of the numbers.
        expect(layout.pool.x).toBeGreaterThanOrEqual(layout.deck.x)
        expect(layout.pool.y).toBeGreaterThanOrEqual(layout.deck.y)
        expect(layout.pool.x + layout.pool.w).toBeLessThanOrEqual(layout.deck.x + layout.deck.w)
        expect(layout.pool.y + layout.pool.h).toBeLessThanOrEqual(layout.deck.y + layout.deck.h)
        expect(layout.poolPath.length).toBeGreaterThan(0)
        expect(layout.poolPath).not.toContain('NaN')
      }),
    )
  })
})
