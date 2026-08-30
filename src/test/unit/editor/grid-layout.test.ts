import { describe, expect, it } from 'vitest'

import {
  GRID_SPAN_FT,
  MAJOR_EVERY,
  gridCentre,
  gridLayout,
  spacingsInFeet,
} from '@/modules/editor/grid-layout'

// The grid drawn and the grid snapped to have to be the same grid.
//
// They were not. The two grids clamped their extents separately, so at a
// one-foot setting one covered 240 feet and the other 400, and past the edge of
// the first you saw only the second: a second grid, of a different size,
// claiming to be the same one. And the divisions were rounded, so the square
// actually drawn was span over divisions rather than the cell size, and the grid
// was lying about the unit.

describe('grid layout', () => {
  it.each(spacingsInFeet())('draws a square of exactly %s ft when that is the snap size', cellFt => {
    const layout = gridLayout(cellFt)
    // The property that was broken: what you see is what you snap to.
    expect(layout.spanFt / layout.divisions).toBeCloseTo(cellFt, 10)
  })

  it.each(spacingsInFeet())('uses whole divisions at %s ft, so no cell is a remainder', cellFt => {
    const layout = gridLayout(cellFt)
    expect(Number.isInteger(layout.divisions)).toBe(true)
    expect(Number.isInteger(layout.majorDivisions)).toBe(true)
  })

  it.each(spacingsInFeet())('lands every heavy line on a fine one at %s ft', cellFt => {
    const layout = gridLayout(cellFt)
    // A factor, not an approximation: otherwise the heavy lines drift between
    // the fine ones and the eye reads two grids.
    expect(layout.divisions % layout.majorDivisions).toBe(0)
    expect(layout.divisions / layout.majorDivisions).toBe(MAJOR_EVERY)
  })

  it('covers the same area whatever the grid size', () => {
    const spans = spacingsInFeet().map(cellFt => gridLayout(cellFt).spanFt)
    expect(new Set(spans).size).toBe(1)
    expect(spans[0]).toBe(GRID_SPAN_FT)
  })

  it('offers the spacings the app actually has', () => {
    // Guards the guard: an empty list would make every case above vacuous.
    expect(spacingsInFeet()).toEqual([0.25, 0.5, 1, 2, 5])
  })

  describe('following the view', () => {
    // A finite grid pinned to the origin stops being under the drawing the
    // moment the drawing walks away, and drawings do: staging puts each new
    // object beside the last, so a plan marches rightward all afternoon. The
    // demo drawing reached 248 ft while the grid stopped at 100.
    it('centres near where the camera is looking', () => {
      const centre = gridCentre({ x: 248, z: 40 }, 1)
      expect(Math.abs(centre.x - 248)).toBeLessThanOrEqual(5)
      expect(Math.abs(centre.z - 40)).toBeLessThanOrEqual(5)
    })

    // A grid that tracks continuously has lines that never sit still: they
    // crawl under the drawing as the camera moves. Jumping whole cells keeps
    // every line exactly where it was in world space.
    it.each(spacingsInFeet())('snaps to whole major cells at %s ft', cellFt => {
      const step = cellFt * MAJOR_EVERY
      for (const x of [0, 3.7, -11.2, 248.4]) {
        const centre = gridCentre({ x, z: x }, cellFt)
        expect(Math.abs(centre.x / step - Math.round(centre.x / step))).toBeLessThan(1e-9)
      }
    })

    it('does not move at all for a camera that has not crossed a cell', () => {
      const a = gridCentre({ x: 0.1, z: 0.1 }, 1)
      const b = gridCentre({ x: 0.2, z: 0.2 }, 1)
      expect(a).toEqual(b)
    })
  })

  it('never asks for zero divisions, whatever it is handed', () => {
    expect(gridLayout(GRID_SPAN_FT * 2).majorDivisions).toBeGreaterThanOrEqual(1)
  })
})
