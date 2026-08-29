// What the studio says, and what a link carries.
//
// Two things worth testing separately from the money. The nudges are the only
// place the page has an opinion, and an opinion that fires on every pool is an
// advert. The share codec is the only place a design crosses a boundary, and a
// codec that drops a field silently sends somebody the wrong pool.

import { describe, expect, it } from 'vitest'

import { DEFAULT_DREAM, coerceDreamConfig, type DreamConfig } from '@/modules/dream/config'
import { measureDream } from '@/modules/dream/measure'
import { dreamNudges } from '@/modules/dream/nudges'
import { priceDream } from '@/modules/dream/pricing'
import { decodeDream, dreamPath, encodeDream } from '@/modules/dream/share'
import { ballparkSpread, budgetVerdict, MAX_SPREAD, spreadReasons } from '@/modules/dream/spread'

function withConfig(overrides: Partial<DreamConfig>): DreamConfig {
  return { ...DEFAULT_DREAM, ...overrides }
}

function nudgesFor(config: DreamConfig) {
  const ballpark = priceDream(config)
  return dreamNudges({
    config,
    poolAreaSqft: ballpark.measurements.poolSurfaceArea,
    deckAreaSqft: ballpark.measurements.deckArea,
    verdict: budgetVerdict(config, ballpark),
  })
}

const ids = (config: DreamConfig) => nudgesFor(config).map((n) => n.id)

describe('the studio only speaks when it has something to say', () => {
  it('tells somebody their walkway is tight, and stops once it is not', () => {
    expect(ids(withConfig({ deckSize: 'minimal' }))).toContain('thin-deck')
    expect(ids(withConfig({ deckSize: 'lounging' }))).not.toContain('thin-deck')
  })

  it('mentions the heater until there is one', () => {
    expect(ids(withConfig({ heater: false }))).toContain('no-heater')
    expect(ids(withConfig({ heater: true }))).not.toContain('no-heater')
  })

  it('says a cage on a small pool is the biggest line, and only then', () => {
    expect(ids(withConfig({ size: 'plunge', screenEnclosure: true }))).toContain('cage-vs-pool')
    expect(ids(withConfig({ size: 'estate', screenEnclosure: true }))).not.toContain('cage-vs-pool')
  })

  it('says nothing about being over budget when no budget was given', () => {
    const nudges = ids(withConfig({ budget: 'unknown', size: 'estate', screenEnclosure: true }))
    expect(nudges).not.toContain('over-budget')
    expect(nudges).not.toContain('tight-budget')
  })

  it('says so when the design has outrun a budget somebody named', () => {
    const config = withConfig({
      budget: 'under-60',
      size: 'estate',
      spa: true,
      screenEnclosure: true,
    })
    expect(ids(config)).toContain('over-budget')
  })

  it('admits when the design is past what a web page can usefully guess', () => {
    const config = withConfig({
      size: 'estate',
      depth: 'diving',
      deckSize: 'entertaining',
      deckMaterial: 'travertine',
      spa: true,
      screenEnclosure: true,
      waterFeatures: 2,
    })
    expect(ballparkSpread(config)).toBe(MAX_SPREAD)
    expect(ids(config)).toContain('past-guessing')
  })

  it('every nudge that names a control names one that exists', () => {
    // A nudge pointing at a field the studio does not render is a message
    // nobody can act on, which is the one thing this module must not produce.
    const configs = [
      DEFAULT_DREAM,
      withConfig({ deckSize: 'minimal', size: 'plunge', screenEnclosure: true }),
      withConfig({ heater: true, spa: true, depth: 'diving', deckSize: 'entertaining' }),
    ]
    for (const config of configs) {
      for (const nudge of nudgesFor(config)) {
        if (nudge.field === null) continue
        expect(Object.keys(DEFAULT_DREAM)).toContain(nudge.field)
      }
    }
  })
})

describe('the range explains itself', () => {
  it('gives a reason for every point of width beyond the irreducible one', () => {
    const plain = withConfig({ size: 'compact', deckSize: 'minimal' })
    expect(spreadReasons(plain)).toEqual([])

    const complex = withConfig({ screenEnclosure: true, spa: true, depth: 'diving' })
    const reasons = spreadReasons(complex)
    expect(reasons.length).toBeGreaterThanOrEqual(3)
    // Written for a homeowner, so no reason is allowed to be a field name.
    for (const reason of reasons) expect(reason).toMatch(/^[A-Z].* .* /)
  })

  it('narrows as the design gets simpler', () => {
    const simple = ballparkSpread(withConfig({ size: 'compact', deckSize: 'minimal' }))
    const elaborate = ballparkSpread(
      withConfig({ size: 'estate', depth: 'diving', screenEnclosure: true, spa: true }),
    )
    expect(simple).toBeLessThan(elaborate)
  })
})

describe('a budget is judged against the middle, not the floor', () => {
  it('calls a design over when its mid is over, even though its low is not', () => {
    const config = withConfig({ budget: '60-90', size: 'entertainer', deckSize: 'entertaining' })
    const ballpark = priceDream(config)
    const verdict = budgetVerdict(config, ballpark)
    expect(verdict?.kind).toBe('over')
    expect(ballpark.mid).toBeGreaterThan(90_000)
  })

  it('calls a design tight when only the top of the range is over', () => {
    const config = withConfig({ budget: 'over-130', size: 'entertainer', deckSize: 'entertaining', spa: true })
    const verdict = budgetVerdict(config, priceDream(config))
    expect(verdict?.kind === 'tight' || verdict?.kind === 'under').toBe(true)
  })

  it('has no verdict at all when nobody named a number', () => {
    const config = withConfig({ budget: 'unknown' })
    expect(budgetVerdict(config, priceDream(config))).toBeNull()
  })
})

describe('a link carries the design', () => {
  it('is short enough to send in a message', () => {
    expect(encodeDream(DEFAULT_DREAM)).toHaveLength(11)
    expect(dreamPath(DEFAULT_DREAM)).toBe(`/dream/${encodeDream(DEFAULT_DREAM)}`)
  })

  it('opens the default backyard for a link that is not one of ours', () => {
    for (const junk of ['', '   ', 'hello', '2abcdefghij', 'x'.repeat(80)]) {
      expect(decodeDream(junk)).toEqual(DEFAULT_DREAM)
    }
    expect(decodeDream(null)).toEqual(DEFAULT_DREAM)
    expect(decodeDream(undefined)).toEqual(DEFAULT_DREAM)
  })

  it('opens what it can read from a link that lost its tail', () => {
    const full = encodeDream(withConfig({ shape: 'kidney', size: 'estate', spa: true, extraLights: 3 }))
    const truncated = full.slice(0, 4)
    const opened = decodeDream(truncated)
    // The fields that survived are honoured; the ones that did not fall back.
    expect(opened.shape).toBe('kidney')
    expect(opened.size).toBe('estate')
    expect(opened.extraLights).toBe(DEFAULT_DREAM.extraLights)
  })

  it('is case-insensitive, because links get lower-cased in transit', () => {
    const code = encodeDream(withConfig({ extraLights: 8, waterFeatures: 4 }))
    expect(decodeDream(code.toUpperCase())).toEqual(decodeDream(code))
  })
})

describe('a config from outside is never trusted', () => {
  it('keeps the good fields and replaces the bad ones', () => {
    const coerced = coerceDreamConfig({
      ...DEFAULT_DREAM,
      shape: 'kidney',
      size: 'not-a-size',
      waterFeatures: 900,
      extraLights: -4,
      spa: 'yes',
    })
    expect(coerced.shape).toBe('kidney')
    expect(coerced.size).toBe(DEFAULT_DREAM.size)
    expect(coerced.waterFeatures).toBe(DEFAULT_DREAM.waterFeatures)
    expect(coerced.extraLights).toBe(DEFAULT_DREAM.extraLights)
    expect(coerced.spa).toBe(DEFAULT_DREAM.spa)
  })

  it('returns the default backyard for something that is not a config at all', () => {
    for (const junk of [null, undefined, 42, 'pool', []]) {
      expect(coerceDreamConfig(junk)).toEqual(DEFAULT_DREAM)
    }
  })

  it('still measures whatever comes out of it', () => {
    expect(measureDream(coerceDreamConfig({ shape: '../../etc/passwd' })).poolSurfaceArea).toBeGreaterThan(0)
  })
})
