// What a pool, and the yard around it, is allowed to be.
//
// These were written for the drag-resize handles and lived in
// `src/modules/editor/interactions/handles.ts`, where they bounded exactly one
// way of changing a size. Every other way in was unbounded: a tester typed
// 99999 into the inspector's length field, the app took it, the layers panel
// read 99999' x 14', and the live quote read $155,928,492 on a pool nineteen
// miles long. One set of numbers, reachable from every entry point, is the only
// arrangement in which the drag path and the typed path can agree.
//
// Two units are in play and both are named, because getting them backwards is
// the defect this codebase keeps producing. `Shape` stores extents in INCHES;
// the inspector and every spoken command work in FEET.

/**
 * Smallest thing worth having on a drawing, in inches.
 *
 * A shape below this is hard to grab again, and a zero-extent one cannot be
 * clicked at all: the drag that made it also loses it.
 */
export const MIN_SIZE_IN = 12

/**
 * Largest, in inches. Four hundred feet.
 *
 * A pool cannot be bigger than the lot and a lot is not half a mile wide.
 */
export const MAX_SIZE_IN = 400 * 12

/** The same two bounds in feet, which is what a person types and says. */
export const MIN_SIZE_FT = MIN_SIZE_IN / 12
export const MAX_SIZE_FT = MAX_SIZE_IN / 12

/**
 * Depth, in feet, and its own pair of numbers rather than the footprint's.
 *
 * Six inches is a tanning ledge, which is the shallowest water anybody sets a
 * depth for. Twenty feet is past the deepest diving well ever built into a
 * back yard, so anything deeper is a typo or a unit mix-up.
 */
export const MIN_DEPTH_FT = 0.5
export const MAX_DEPTH_FT = 20

/**
 * How far from the drawing origin anything may be placed, in inches.
 *
 * Generous on purpose: a site plan puts a road frontage and a rear easement on
 * the same sheet, so this is a bound against a coordinate that is a typo, not
 * an opinion about where things belong.
 */
export const MAX_COORD_IN = 5_000 * 12
export const MAX_COORD_FT = MAX_COORD_IN / 12

/**
 * Floor slope, as rise over run.
 *
 * Zero is a flat-bottomed pool, which is a real pool. At 1.0 the floor is a
 * wall, so the whole usable range sits well inside this.
 */
export const MIN_SLOPE = 0
export const MAX_SLOPE = 1

/** Degrees. A full turn either way is every angle there is. */
export const MAX_ROTATION_DEG = 360

/** Surface area a pool may be asked to hit, in square feet. Derived, not chosen. */
export const MIN_AREA_SQFT = MIN_SIZE_FT * MIN_SIZE_FT
export const MAX_AREA_SQFT = MAX_SIZE_FT * MAX_SIZE_FT

/**
 * Heights measured off the pool rather than the ground, in inches: a sun-shelf
 * standing proud of the floor, a bubbler standing proud of the water. Ten feet
 * is a fountain; these are neither.
 */
export const MIN_FEATURE_HEIGHT_IN = 0
export const MAX_FEATURE_HEIGHT_IN = 120

/**
 * Pull an extent back inside the bounds.
 *
 * For the DRAG path only, and that difference is deliberate. A drag is a stream
 * of pointer positions rather than a value somebody chose: the shape stops
 * growing under the cursor and the user sees it stop, so there is no input to
 * lose and nothing to tell them. A typed or spoken value is a decision, and
 * quietly replacing a decision with a different number puts a figure on a quote
 * that nobody chose. Those are refused instead; see
 * `src/lib/commands/dimensions.ts`.
 */
export function clampSizeIn(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIZE_IN
  return Math.min(MAX_SIZE_IN, Math.max(MIN_SIZE_IN, value))
}

/** True when a pool's two depths describe a pool rather than an upside-down one. */
export function depthsAreOrdered(shallowFt: number, deepFt: number): boolean {
  if (!Number.isFinite(shallowFt) || !Number.isFinite(deepFt)) return false
  return shallowFt <= deepFt
}

/**
 * Fall of the pool floor from the shallow end to the deep end, as rise over run.
 *
 * Always finite: the length is what divides, so a pool with no length has no
 * slope rather than an infinite one. Callers print this, and `Infinity` on a
 * construction packet is worse than a zero.
 */
export function floorSlope(shallowFt: number, deepFt: number, lengthFt: number): number {
  if (!Number.isFinite(shallowFt) || !Number.isFinite(deepFt)) return 0
  if (!Number.isFinite(lengthFt) || lengthFt <= 0) return 0
  const slope = Math.max(0, deepFt - shallowFt) / lengthFt
  // A length small enough to overflow the division is smaller than anything the
  // bounds permit, and the fall of a pool a fraction of a micron long is not a
  // number worth printing. Zero is the honest answer; `Infinity` is not.
  return Number.isFinite(slope) ? slope : 0
}
