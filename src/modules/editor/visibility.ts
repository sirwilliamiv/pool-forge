// Is the thing that was just added actually on screen?
//
// Objects added from the stencil panel, the command palette or by voice have no
// pointer to place them at, so `stagingPlacement` stages them beside whatever is
// already drawn. That is sensible in world coordinates and says nothing about
// where the camera happens to be looking: pan away, or draw enough that the
// staging block marches off to the right, and a new object lands correctly and
// invisibly. The user asked for a spa and the screen did not change.
//
// The camera should not lurch every time something is added, though, because an
// object placed by pointer is on screen by definition and moving the view out
// from under a drag is worse than the bug. So the rule is conditional: reveal
// only what is not already visible.
//
// Projection is the caller's job. Everything here is arithmetic on the result,
// so the decision is unit-testable without a camera, a canvas or a GPU.

/** A point after projection, in normalised device coordinates. */
export interface NdcPoint {
  x: number
  y: number
  /** Greater than 1 means behind the far plane; less than -1, behind the camera. */
  z: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The eight corners of a box standing on the ground, in world units.
 *
 * `height` is the footprint's depth on the ground plane, not its elevation:
 * these are plan-view boxes. `rise` lifts the top face so a tall object counts
 * as off screen when its head is cut off rather than only its footprint.
 */
export function boxCorners(box: Box, rise = 0): [number, number, number][] {
  const x0 = box.x
  const x1 = box.x + box.width
  const z0 = box.y
  const z1 = box.y + box.height
  const corners: [number, number, number][] = []
  for (const x of [x0, x1]) {
    for (const z of [z0, z1]) {
      corners.push([x, 0, z])
      if (rise > 0) corners.push([x, rise, z])
    }
  }
  return corners
}

/**
 * True when every corner sits comfortably inside the viewport.
 *
 * `margin` is a fraction of half the screen, so 0.1 keeps a tenth of the way in
 * from each edge. An object touching the very edge of the frame is technically
 * visible and practically missed, and it is usually half under a panel.
 */
export function fullyVisible(corners: NdcPoint[], margin = 0.1): boolean {
  if (corners.length === 0) return false
  const limit = 1 - margin
  return corners.every(
    point =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Math.abs(point.x) <= limit &&
      Math.abs(point.y) <= limit &&
      // Behind the camera projects to a point that passes the x and y test
      // while being nowhere the user can see.
      point.z >= -1 &&
      point.z <= 1,
  )
}

/** Ids present in `next` that were not in `previous`. */
export function addedIds(previous: ReadonlySet<string>, next: readonly { id: string }[]): string[] {
  return next.filter(item => !previous.has(item.id)).map(item => item.id)
}
