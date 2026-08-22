// Property tests for the elevation model.
//
// Everything downstream reads from it — the terrain mesh, where every object
// sits, the section profile, and the cut/fill that goes on a quote — so an error
// here is an error in four places at once, and a wrong earthwork volume is a
// wrong price on a signed contract.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  cutFillBetween,
  elevationAt,
  emptyGrade,
  maxSlope,
  profileAlong,
  sampleGrade,
  type GradePoint,
  type SiteGrade,
} from '@/modules/editor/grade/model'

const coord = fc.integer({ min: -2_000, max: 2_000 })
const elevation = fc.double({ min: -30, max: 30, noNaN: true, noDefaultInfinity: true })

const point: fc.Arbitrary<GradePoint> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  x: coord,
  y: coord,
  elevationFt: elevation,
  kind: fc.constantFrom('existing' as const, 'finished' as const, 'fixed' as const),
})

const grade: fc.Arbitrary<SiteGrade> = fc.record({
  baseElevationFt: elevation,
  points: fc.array(point, { maxLength: 12 }),
  falloff: fc.double({ min: 1, max: 4, noNaN: true }),
  enabled: fc.constant(true),
})

const BOUNDS = { x: -600, y: -600, width: 1_200, height: 1_200 }

describe('elevationAt', () => {
  it('is flat when the site is flat', () => {
    fc.assert(
      fc.property(elevation, coord, coord, (base, x, y) => {
        const flat = { ...emptyGrade(), baseElevationFt: base, enabled: true }
        expect(elevationAt(flat, x, y)).toBe(base)
      }),
      { numRuns: 200 },
    )
  })

  it('returns the measured height when standing on a shot', () => {
    // A laser shot is the one number on site that is not an estimate; the model
    // must not smooth it away.
    fc.assert(
      fc.property(grade.filter(g => g.points.length > 0), g => {
        const first = g.points[0]!
        expect(elevationAt(g, first.x, first.y)).toBeCloseTo(first.elevationFt, 6)
      }),
      { numRuns: 300 },
    )
  })

  it('never invents ground outside the range of the shots', () => {
    // Interpolation, not extrapolation. A method that overshoots would put the
    // finished patio above the highest point anybody measured.
    fc.assert(
      fc.property(grade.filter(g => g.points.length > 0), coord, coord, (g, x, y) => {
        const heights = g.points.map(p => p.elevationFt)
        const here = elevationAt(g, x, y)
        expect(here).toBeGreaterThanOrEqual(Math.min(...heights) - 1e-6)
        expect(here).toBeLessThanOrEqual(Math.max(...heights) + 1e-6)
      }),
      { numRuns: 400 },
    )
  })

  it('falls back to the base where nothing has been measured', () => {
    fc.assert(
      fc.property(elevation, coord, coord, (base, x, y) => {
        const g = { ...emptyGrade(), baseElevationFt: base, enabled: true, points: [] }
        expect(elevationAt(g, x, y)).toBe(base)
      }),
      { numRuns: 200 },
    )
  })

  it('is off until it is turned on', () => {
    // A flat site is still the common case, and it must cost nothing.
    fc.assert(
      fc.property(grade, coord, coord, (g, x, y) => {
        const off = { ...g, enabled: false }
        expect(elevationAt(off, x, y)).toBe(g.baseElevationFt)
      }),
      { numRuns: 200 },
    )
  })

  it('does not depend on the order the shots were taken', () => {
    fc.assert(
      fc.property(grade, coord, coord, (g, x, y) => {
        const reversed = { ...g, points: [...g.points].reverse() }
        expect(elevationAt(reversed, x, y)).toBeCloseTo(elevationAt(g, x, y), 9)
      }),
      { numRuns: 300 },
    )
  })

  it('moves the whole site when the datum moves', () => {
    // Re-benchmarking against a different datum must shift everything equally,
    // never reshape the ground.
    fc.assert(
      fc.property(grade.filter(g => g.points.length > 0), elevation, coord, coord, (g, shift, x, y) => {
        const shifted = {
          ...g,
          baseElevationFt: g.baseElevationFt + shift,
          points: g.points.map(p => ({ ...p, elevationFt: p.elevationFt + shift })),
        }
        expect(elevationAt(shifted, x, y)).toBeCloseTo(elevationAt(g, x, y) + shift, 6)
      }),
      { numRuns: 300 },
    )
  })

  it('produces a finite height everywhere', () => {
    // NaN in the height field is a hole in the lawn and a NaN volume on the quote.
    fc.assert(
      fc.property(grade, coord, coord, (g, x, y) => {
        expect(Number.isFinite(elevationAt(g, x, y))).toBe(true)
      }),
      { numRuns: 400 },
    )
  })
})

describe('sampleGrade', () => {
  it('never returns a lattice big enough to hang the tab', () => {
    // A two-hundred foot yard at one-inch spacing is five million samples.
    fc.assert(
      fc.property(grade, fc.integer({ min: 1, max: 4 }), (g, step) => {
        const sample = sampleGrade(g, { x: 0, y: 0, width: 100_000, height: 100_000 }, step)
        expect(sample.cols * sample.rows).toBeLessThanOrEqual(200 * 200)
      }),
      { numRuns: 40 },
    )
  })

  it('returns exactly the heights it claims to', () => {
    fc.assert(
      fc.property(grade, g => {
        const sample = sampleGrade(g, BOUNDS, 48)
        expect(sample.heights).toHaveLength(sample.cols * sample.rows)
        expect(sample.heights.every(Number.isFinite)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

describe('cutFillBetween', () => {
  it('is nothing when the ground does not move', () => {
    fc.assert(
      fc.property(grade, g => {
        const result = cutFillBetween(g, g, BOUNDS, 96)
        expect(result.cutYards).toBe(0)
        expect(result.fillYards).toBe(0)
      }),
      { numRuns: 100 },
    )
  })

  it('reports cut and fill separately, never netted', () => {
    // They are different jobs with different costs: a yard out is haulage, a
    // yard in is material, and a site that balances on paper bills for both.
    const existing = { ...emptyGrade(), enabled: true, baseElevationFt: 0 }
    const finished = { ...emptyGrade(), enabled: true, baseElevationFt: -2 }
    const result = cutFillBetween(existing, finished, BOUNDS, 96)
    expect(result.cutYards).toBeGreaterThan(0)
    expect(result.fillYards).toBe(0)
  })

  it('reverses when the two grades swap', () => {
    fc.assert(
      fc.property(elevation, elevation, (a, b) => {
        const first = { ...emptyGrade(), enabled: true, baseElevationFt: a }
        const second = { ...emptyGrade(), enabled: true, baseElevationFt: b }
        const forward = cutFillBetween(first, second, BOUNDS, 96)
        const back = cutFillBetween(second, first, BOUNDS, 96)
        expect(forward.cutYards).toBeCloseTo(back.fillYards, 1)
        expect(forward.fillYards).toBeCloseTo(back.cutYards, 1)
      }),
      { numRuns: 100 },
    )
  })

  it('never reports a negative volume', () => {
    fc.assert(
      fc.property(grade, grade, (a, b) => {
        const result = cutFillBetween(a, b, BOUNDS, 96)
        expect(result.cutYards).toBeGreaterThanOrEqual(0)
        expect(result.fillYards).toBeGreaterThanOrEqual(0)
        expect(result.reliefFt).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 },
    )
  })

  it('scales with the depth of the dig', () => {
    const existing = { ...emptyGrade(), enabled: true, baseElevationFt: 0 }
    const shallow = cutFillBetween(existing, { ...existing, baseElevationFt: -1 }, BOUNDS, 96)
    const deep = cutFillBetween(existing, { ...existing, baseElevationFt: -3 }, BOUNDS, 96)
    expect(deep.cutYards).toBeGreaterThan(shallow.cutYards * 2.5)
  })

  it('computes a dig by hand correctly', () => {
    // Ten feet by ten feet taken down one foot is 100 cubic feet, which is
    // 3.7 cubic yards. Worth one arithmetic check that does not go through a
    // property.
    const existing = { ...emptyGrade(), enabled: true, baseElevationFt: 0 }
    const finished = { ...emptyGrade(), enabled: true, baseElevationFt: -1 }
    const result = cutFillBetween(existing, finished, { x: 0, y: 0, width: 120, height: 120 }, 12)
    expect(result.cutYards).toBeGreaterThan(3.5)
    expect(result.cutYards).toBeLessThan(5.5)
  })
})

describe('profileAlong', () => {
  it('starts and ends where the line does', () => {
    fc.assert(
      fc.property(grade, coord, coord, coord, coord, (g, x1, y1, x2, y2) => {
        const profile = profileAlong(g, { x: x1, y: y1 }, { x: x2, y: y2 }, 32)
        expect(profile[0]?.distanceFt).toBeCloseTo(0, 6)
        const expected = Math.hypot(x2 - x1, y2 - y1) / 12
        expect(profile.at(-1)?.distanceFt).toBeCloseTo(expected, 6)
      }),
      { numRuns: 200 },
    )
  })

  it('runs monotonically away from the start', () => {
    fc.assert(
      fc.property(grade, coord, coord, coord, coord, (g, x1, y1, x2, y2) => {
        const profile = profileAlong(g, { x: x1, y: y1 }, { x: x2, y: y2 }, 24)
        for (let i = 1; i < profile.length; i++) {
          expect(profile[i]!.distanceFt).toBeGreaterThanOrEqual(profile[i - 1]!.distanceFt - 1e-9)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('agrees with the field it was cut from', () => {
    fc.assert(
      fc.property(grade, coord, coord, coord, coord, (g, x1, y1, x2, y2) => {
        for (const p of profileAlong(g, { x: x1, y: y1 }, { x: x2, y: y2 }, 8)) {
          expect(p.elevationFt).toBeCloseTo(elevationAt(g, p.x, p.y), 6)
        }
      }),
      { numRuns: 200 },
    )
  })
})

describe('maxSlope', () => {
  it('is zero on flat ground', () => {
    fc.assert(
      fc.property(elevation, base => {
        expect(maxSlope({ ...emptyGrade(), enabled: true, baseElevationFt: base }, BOUNDS, 96)).toBe(0)
      }),
      { numRuns: 100 },
    )
  })

  it('is never negative', () => {
    fc.assert(
      fc.property(grade, g => {
        expect(maxSlope(g, BOUNDS, 96)).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 },
    )
  })
})
