// What the studio actually says about real backyards.
//
// The property tests prove the arithmetic holds together. These check the
// figures are the right size, which no invariant can: a page that consistently
// tells homeowners a family pool costs nineteen thousand dollars is internally
// consistent and useless, and the only way to catch it is to write down what a
// pool costs and fail when the page disagrees.
//
// The bounds below are wide on purpose. They are not a claim about the market,
// they are a tripwire: an order-of-magnitude error, a category that stopped
// billing, or a rate typed with the wrong number of zeros all break them, and
// nothing else does.

import { describe, expect, it } from 'vitest'

import { DEFAULT_DREAM, type DreamConfig } from '@/modules/dream/config'
import { measureDream } from '@/modules/dream/measure'
import { priceDream, referenceBook, referenceSelections } from '@/modules/dream/pricing'
import { PriceCategory } from '@/modules/pricing/engine'

function withConfig(overrides: Partial<DreamConfig>): DreamConfig {
  return { ...DEFAULT_DREAM, ...overrides }
}

describe('the ballpark is the right size', () => {
  it('prices the smallest thing in the catalogue as a real job, not a bargain', () => {
    const ballpark = priceDream(
      withConfig({ size: 'plunge', depth: 'wading', deckSize: 'minimal' }),
    )
    // Even the smallest gunite pool is a six-week build with a crew, a permit
    // and an equipment pad. Nothing here should ever suggest otherwise.
    expect(ballpark.mid).toBeGreaterThan(35_000)
    expect(ballpark.mid).toBeLessThan(80_000)
  })

  it('prices the pool most people picture in the range most people quote', () => {
    const ballpark = priceDream(DEFAULT_DREAM)
    expect(ballpark.mid).toBeGreaterThan(70_000)
    expect(ballpark.mid).toBeLessThan(130_000)
  })

  it('prices a fully loaded estate backyard without running away', () => {
    const ballpark = priceDream(
      withConfig({
        size: 'estate',
        depth: 'diving',
        finish: 'pebble',
        deckSize: 'entertaining',
        deckMaterial: 'travertine',
        spa: true,
        heater: true,
        saltwater: true,
        screenEnclosure: true,
        waterFeatures: 4,
        extraLights: 4,
      }),
    )
    expect(ballpark.mid).toBeGreaterThan(200_000)
    expect(ballpark.mid).toBeLessThan(450_000)
  })
})

describe('everything the visitor can choose actually reaches the money', () => {
  /**
   * The failure this guards against is silent and total: a category the engine
   * prices at zero means a control that moves nothing, and a control that moves
   * nothing is indistinguishable from a working one until somebody checks the
   * total. It happened to `ELECTRICAL` and `MISC`, which is why those two ride
   * as project line items rather than price-book lines.
   */
  const switches: ReadonlyArray<[string, Partial<DreamConfig>]> = [
    ['spa', { spa: true }],
    ['heater', { heater: true }],
    ['saltwater', { saltwater: true }],
    ['screen enclosure', { screenEnclosure: true }],
    ['water features', { waterFeatures: 2 }],
    ['extra lights', { extraLights: 3 }],
    ['a deeper pool', { depth: 'diving' }],
    ['a bigger pool', { size: 'estate' }],
    ['a richer finish', { finish: 'pebble' }],
    ['more paving', { deckSize: 'entertaining' }],
    ['better paving', { deckMaterial: 'travertine' }],
  ]

  for (const [name, change] of switches) {
    it(`${name} moves the total`, () => {
      const base = priceDream(DEFAULT_DREAM).mid
      expect(priceDream(withConfig(change)).mid).toBeGreaterThan(base)
    })
  }
})

describe('the work nobody can see is still on the bill', () => {
  it('bills permits and the electrical hook-up on every pool', () => {
    const quote = priceDream(DEFAULT_DREAM).quote
    const categories = new Set(quote.lineItems.map((line) => line.category))
    // A homeowner's ballpark that omitted these would be low by five figures on
    // every single pool, which is the one direction it must not be wrong in.
    expect(categories.has(PriceCategory.ELECTRICAL)).toBe(true)
    expect(categories.has(PriceCategory.MISC)).toBe(true)
  })

  it('bills the pump whether or not anything else was chosen', () => {
    const quote = priceDream(DEFAULT_DREAM).quote
    expect(quote.lineItems.some((line) => line.name.includes('Pump'))).toBe(true)
  })

  it('bills excavation against the hole it actually dug', () => {
    const shallow = priceDream(withConfig({ depth: 'wading' }))
    const deep = priceDream(withConfig({ depth: 'diving' }))
    const earthwork = (b: typeof shallow) =>
      b.quote.lineItems
        .filter((line) => line.category === PriceCategory.EARTHWORK)
        .reduce((sum, line) => sum + line.total, 0)
    expect(earthwork(deep)).toBeGreaterThan(earthwork(shallow))
  })
})

describe('the reference book cannot bill the same ground twice', () => {
  it('reports no unpriced categories and no collisions on a full design', () => {
    const config = withConfig({
      spa: true,
      heater: true,
      saltwater: true,
      screenEnclosure: true,
      waterFeatures: 2,
      extraLights: 2,
    })
    const quote = priceDream(config).quote

    expect(quote.status).toBe('PRICED')
    // A collision suspends both colliding lines, so a design that collides
    // quotes low and says so in a panel this page does not render. The
    // constraint is that the reference book never produces one.
    const categoryLevel = quote.unpriced.filter((u) => u.scope === 'category')
    expect(categoryLevel).toEqual([])
  })

  it('holds at most one line per category and unit', () => {
    const book = referenceBook(DEFAULT_DREAM)
    const seen = new Set<string>()
    for (const item of book) {
      // Equipment is the one additive category: a pump, a heater and a salt
      // cell are three things rather than three ways of doing one thing.
      if (item.category === PriceCategory.EQUIPMENT) continue
      const key = `${item.category}:${item.unitType}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('carries the site work as project lines, where the engine will bill it', () => {
    const lines = referenceSelections(DEFAULT_DREAM).projectLineItems ?? []
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line.quantity).toBeGreaterThan(0)
      expect(line.unitPrice).toBeGreaterThan(0)
    }
  })
})

describe('the measurements behind the money', () => {
  it('holds the water a pool of that size holds', () => {
    // A 16 x 32 rectangle at an average depth of 4'9" is a shade under 18,000
    // gallons, which is the figure on every spec sheet for a pool this size.
    const m = measureDream(DEFAULT_DREAM)
    expect(m.poolSurfaceArea).toBeCloseTo(512, 0)
    expect(m.poolGallons).toBeGreaterThan(16_000)
    expect(m.poolGallons).toBeLessThan(20_000)
  })

  it('gives a curved pool less water and a longer edge than its bounding box', () => {
    const rect = measureDream(withConfig({ shape: 'rectangle' }))
    const oval = measureDream(withConfig({ shape: 'oval' }))
    expect(oval.poolSurfaceArea).toBeLessThan(rect.poolSurfaceArea)
    expect(oval.poolPerimeter).toBeLessThan(rect.poolPerimeter)

    const ell = measureDream(withConfig({ shape: 'ell' }))
    expect(ell.poolSurfaceArea).toBeLessThan(rect.poolSurfaceArea)
    // The L is the one shape whose edge outruns its box: the inside corner is
    // walked twice.
    expect(ell.poolPerimeter).toBeGreaterThan(rect.poolPerimeter)
  })

  it('counts enough lights to swim by without anybody asking for one', () => {
    const m = measureDream(withConfig({ extraLights: 0 }))
    expect(m.lightCount).toBeGreaterThanOrEqual(1)
  })

  it('adds the spa water to the gallons', () => {
    const without = measureDream(withConfig({ spa: false }))
    const with_ = measureDream(withConfig({ spa: true }))
    expect(with_.poolGallons).toBeGreaterThan(without.poolGallons)
    expect(with_.spaCount).toBe(1)
  })

  it('claims no slope, because it cannot see the site', () => {
    // The honest answer, and the one `spread.ts` widens the range for instead.
    expect(measureDream(DEFAULT_DREAM).maxSlopePct).toBe(0)
    expect(measureDream(DEFAULT_DREAM).fillYards).toBe(0)
  })
})
