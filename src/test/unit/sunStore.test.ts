import { describe, expect, it } from 'vitest'
import {
  selectSunColor,
  selectSunDirection,
  selectSunIntensity,
} from '@/modules/editor/state/sunStore'
import type { SunState } from '@/modules/editor/state/sunStore'

const SUNRISE = 6 * 60 + 21
const SUNSET = 20 * 60 + 31
const NOON = SUNRISE + (SUNSET - SUNRISE) / 2

function state(minutes: number): SunState {
  return {
    minutesPastMidnight: minutes,
    sunrise: SUNRISE,
    sunset: SUNSET,
    setMinutes: () => undefined,
    setSunriseSunset: () => undefined,
  }
}

function isUnit(v: [number, number, number]): boolean {
  const len = Math.hypot(...v)
  return Math.abs(len - 1) < 1e-9
}

describe('selectSunDirection', () => {
  it('returns a unit vector at sunrise / noon / sunset', () => {
    expect(isUnit(selectSunDirection(state(SUNRISE)))).toBe(true)
    expect(isUnit(selectSunDirection(state(NOON)))).toBe(true)
    expect(isUnit(selectSunDirection(state(SUNSET)))).toBe(true)
  })

  it('arcs through positive-x quadrant — x is ~0 at endpoints, peaks before noon', () => {
    const rise = selectSunDirection(state(SUNRISE))
    const set = selectSunDirection(state(SUNSET))
    expect(Math.abs(rise[0])).toBeLessThan(1e-9)
    expect(Math.abs(set[0])).toBeLessThan(1e-9)
    const mid = selectSunDirection(state(SUNRISE + (SUNSET - SUNRISE) * 0.25))
    expect(mid[0]).toBeGreaterThan(0)
  })

  it('peaks at noon — y component highest', () => {
    const noon = selectSunDirection(state(NOON))
    const rise = selectSunDirection(state(SUNRISE))
    expect(noon[1]).toBeGreaterThan(rise[1])
  })

  it('clamps minutes outside the day to sunrise / sunset endpoints', () => {
    const beforeRise = selectSunDirection(state(SUNRISE - 60))
    const afterSet = selectSunDirection(state(SUNSET + 60))
    expect(beforeRise).toEqual(selectSunDirection(state(SUNRISE)))
    expect(afterSet).toEqual(selectSunDirection(state(SUNSET)))
  })
})

describe('selectSunColor', () => {
  it('is whitest at noon, warmest at sunrise/sunset', () => {
    const [, gNoon, bNoon] = selectSunColor(state(NOON))
    const [, gRise, bRise] = selectSunColor(state(SUNRISE))
    expect(gNoon).toBeGreaterThan(gRise)
    expect(bNoon).toBeGreaterThan(bRise)
  })

  it('matches expected formula at noon (warm channels saturated)', () => {
    const [r, g, b] = selectSunColor(state(NOON))
    expect(r).toBeCloseTo(1.0, 5)
    expect(g).toBeCloseTo(0.98, 5)
    expect(b).toBeCloseTo(0.92, 5)
  })

  it('all components ≤ 1.0', () => {
    for (const m of [SUNRISE, SUNRISE + 60, NOON, SUNSET - 60, SUNSET]) {
      const c = selectSunColor(state(m))
      expect(c[0]).toBeLessThanOrEqual(1)
      expect(c[1]).toBeLessThanOrEqual(1)
      expect(c[2]).toBeLessThanOrEqual(1)
    }
  })
})

describe('selectSunIntensity', () => {
  it('is highest at noon, lowest at endpoints', () => {
    const noon = selectSunIntensity(state(NOON))
    const rise = selectSunIntensity(state(SUNRISE))
    const set = selectSunIntensity(state(SUNSET))
    expect(noon).toBeGreaterThan(rise)
    expect(noon).toBeGreaterThan(set)
    expect(rise).toBeCloseTo(0.5, 5)
    expect(set).toBeCloseTo(0.5, 5)
    expect(noon).toBeCloseTo(1.2, 5)
  })
})
