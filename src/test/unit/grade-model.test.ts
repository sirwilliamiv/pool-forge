// What the ground reports, and whether a person can believe it.
//
// A tester turned grading on, added two elevations and set them two feet apart,
// and the panel told him the site fell one foot with a steepest slope of 0%,
// while the water in the 3D view drained away. Every one of those three numbers
// came from the same cause: both elevations were dropped at the same spot.

import { describe, expect, it } from 'vitest'

import {
  cutFillBetween,
  elevationAt,
  emptyGrade,
  maxSlope,
  nextShotPosition,
  type GradePoint,
  type SiteGrade,
} from '@/modules/editor/grade/model'

const BOUNDS = { x: -600, y: -600, width: 1_200, height: 1_200 }

function gradeWith(points: Array<Partial<GradePoint> & { elevationFt: number }>): SiteGrade {
  return {
    ...emptyGrade(),
    enabled: true,
    points: points.map((point, index) => ({
      id: `p${index}`,
      x: point.x ?? 0,
      y: point.y ?? 0,
      elevationFt: point.elevationFt,
      kind: point.kind ?? 'existing',
    })),
  }
}

describe('two elevations at the same spot', () => {
  it('does not report the average as though the site were flat there', () => {
    // Both shots on one spot is a contradiction in the data: the ground cannot
    // be at 0 and at 2. Returning whichever was recorded first, and the mean
    // everywhere else, turns a contradiction into a confident wrong answer.
    const grade = gradeWith([{ elevationFt: 0 }, { elevationFt: 2 }])

    // Whatever it reports standing on the spot, it has to agree with itself one
    // inch away, or the surface has a cliff at a point the user cannot see.
    const onIt = elevationAt(grade, 0, 0)
    const besideIt = elevationAt(grade, 1, 0)
    expect(Math.abs(onIt - besideIt)).toBeLessThan(0.05)
  })
})

describe('a site that falls two feet', () => {
  const grade = gradeWith([
    { x: -400, y: 0, elevationFt: 0 },
    { x: 400, y: 0, elevationFt: 2 },
  ])

  it('reports the fall the user entered, not a fraction of it', () => {
    const { reliefFt } = cutFillBetween(grade, grade, BOUNDS)
    expect(reliefFt).toBeGreaterThanOrEqual(1.9)
  })

  it('does not report a falling site as 0% slope', () => {
    expect(maxSlope(grade, BOUNDS)).toBeGreaterThan(0)
  })
})

describe('a shot between the sample lines', () => {
  // The lattice is 24 inches apart. A survey shot lands wherever the laser was
  // pointed, and a two-foot drop that happens to sit between two sample lines
  // was invisible: the panel read 0 ft of fall over ground that visibly falls.
  it('is included in the fall, not sampled past', () => {
    const grade = gradeWith([
      { x: -600, y: -600, elevationFt: 0 },
      { x: 13, y: 7, elevationFt: -4 },
    ])
    const { reliefFt } = cutFillBetween(grade, grade, BOUNDS)
    expect(reliefFt).toBeGreaterThanOrEqual(3.9)
  })
})

describe('the datum', () => {
  // Shots are absolute elevations and the datum is the height of ground nobody
  // measured: that contract is pinned by properties in grade.property.test.ts,
  // and interpolation must not read the datum at all once a shot exists.
  //
  // Which left the Datum box on the panel doing nothing visible, because one
  // shot is enough to make every position interpolated. It is the elevation a
  // new shot starts at instead, so a site benchmarked at 12 feet no longer
  // drops twelve feet the moment someone presses Add.
  it('is not read once the site has been surveyed', () => {
    const surveyed = { ...gradeWith([{ x: 0, y: 0, elevationFt: 3 }]), baseElevationFt: 5 }
    expect(elevationAt(surveyed, 500, 500)).toBeCloseTo(3, 6)
  })

  it('is the height of ground nobody measured', () => {
    const untouched = { ...emptyGrade(), enabled: true, baseElevationFt: 5 }
    expect(elevationAt(untouched, 500, 500)).toBe(5)
  })
})

describe('where the Add button puts a shot', () => {
  // The panel is the only way to record an elevation by hand, and it dropped
  // every one of them in the middle of the drawing. The first was fine. The
  // second landed on the first.
  it('never puts two shots in the same place', () => {
    const seen = new Set<string>()
    for (let count = 0; count < 24; count++) {
      const spot = nextShotPosition(count, BOUNDS)
      const key = `${Math.round(spot.x)},${Math.round(spot.y)}`
      expect(seen.has(key), `shot ${count + 1} landed on an earlier one at ${key}`).toBe(false)
      seen.add(key)
    }
  })

  it('keeps every shot inside the site', () => {
    for (let count = 0; count < 24; count++) {
      const spot = nextShotPosition(count, BOUNDS)
      expect(spot.x).toBeGreaterThanOrEqual(BOUNDS.x)
      expect(spot.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width)
      expect(spot.y).toBeGreaterThanOrEqual(BOUNDS.y)
      expect(spot.y).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height)
    }
  })

  it('reports the fall a user gets from two shots and two numbers', () => {
    // Ray's session, in full: turn grading on, press Add twice, type 0 and 2.
    const points = [0, 2].map((elevationFt, index) => {
      const spot = nextShotPosition(index, BOUNDS)
      return { id: `p${index}`, x: spot.x, y: spot.y, elevationFt, kind: 'existing' as const }
    })
    const grade: SiteGrade = { ...emptyGrade(), enabled: true, points }

    const { reliefFt } = cutFillBetween(grade, grade, BOUNDS)
    expect(reliefFt).toBeGreaterThanOrEqual(1.5)
    expect(maxSlope(grade, BOUNDS)).toBeGreaterThan(0)
  })
})
