import { GRID_SPACINGS } from '@/lib/geometry/drawing'

// How the grid is drawn, as opposed to what it snaps to.
//
// These have to agree exactly, and they did not. Two faults, and together they
// put several different sized squares on screen at once, all claiming to be the
// same size.
//
// The fine grid and the heavier every-tenth grid each clamped their own extent,
// so at a one-foot setting the fine grid covered 240 feet and the heavy one
// covered 400. Past the edge of the fine grid you saw only the coarse one, which
// reads as a second grid of a different size rather than as the same grid
// continuing.
//
// And the divisions were rounded: `round(span / cell)`. When the span was not an
// exact multiple of the cell, the square actually drawn was `span / divisions`,
// which is not the size anything snapped to. The grid was lying about the unit.
//
// So the span is derived from the cell rather than clamped independently, and
// the division counts are integers by construction. A drawn square is exactly
// the snap size, and a heavy line falls exactly on a fine one.

/**
 * How far the grid reaches, in feet.
 *
 * One number for every spacing, so changing the grid size never changes the area
 * the grid covers. 200 is chosen so that every spacing the app offers divides it
 * exactly: at 3, 6, 12, 24 and 60 inches that is 800, 400, 200, 100 and 40
 * divisions, all whole, and all still whole after dividing by ten for the heavy
 * lines.
 */
export const GRID_SPAN_FT = 200

/** A heavier line every this many cells, which is what makes a grid countable. */
export const MAJOR_EVERY = 10

export interface GridLayout {
  spanFt: number
  /** Fine divisions across the span. `spanFt / divisions` is exactly `cellFt`. */
  divisions: number
  /** Heavy divisions across the same span. Always a factor of `divisions`. */
  majorDivisions: number
}

export function gridLayout(cellFt: number): GridLayout {
  const divisions = Math.round(GRID_SPAN_FT / cellFt)
  return {
    spanFt: GRID_SPAN_FT,
    divisions,
    majorDivisions: Math.max(1, Math.round(divisions / MAJOR_EVERY)),
  }
}

/**
 * Where to centre the grid so it sits under the view.
 *
 * Pinned to the origin, a finite grid stops being under the drawing the moment
 * the drawing walks away from it, and drawings do: objects added from the panel
 * are staged beside whatever is already there, so a plan marches rightward all
 * afternoon. This one follows the camera.
 *
 * Snapped to whole major cells rather than tracking continuously, because a grid
 * that slides with the camera has lines that never sit still: they crawl under
 * the drawing and shimmer. Jumping a whole cell at a time keeps every line
 * exactly where it was in world space.
 */
export function gridCentre(targetFt: { x: number; z: number }, cellFt: number): { x: number; z: number } {
  const step = cellFt * MAJOR_EVERY
  return {
    x: Math.round(targetFt.x / step) * step,
    z: Math.round(targetFt.z / step) * step,
  }
}

/** Every spacing the app offers, in feet. */
export function spacingsInFeet(): number[] {
  return GRID_SPACINGS.map(spacing => spacing.inches / 12)
}
