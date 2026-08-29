import { polygonBounds, polygonCentroid, type PolygonPoint } from './polygon-footprint'

// Dropping something into a space that was drawn.
//
// A pool builder draws the lanai, then puts a spa in it. The spa should end up
// inside the lanai, not overlapping its edge and not floating past it, and it
// should not need nudging with the arrow keys to get there.
//
// All inches, all axis-aligned. Rotated footprints are handled by fitting their
// bounding box, which is conservative: an object that would just fit at an
// angle is shrunk slightly more than it strictly needs to be. That is the right
// way to be wrong, since the alternative puts a corner through a wall.

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Is the point inside the ring?
 *
 * Ray casting, counting crossings to the right. A point exactly on an edge is
 * deliberately unspecified: callers here are asking about centres and corners of
 * a dragged object, and a boundary case one way or the other changes nothing
 * they can see.
 */
export function pointInPolygon(point: PolygonPoint, polygon: readonly PolygonPoint[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    const straddles = a.y > point.y !== b.y > point.y
    if (!straddles) continue
    const t = (b.x - a.x) * (point.y - a.y)
    const denominator = b.y - a.y
    if (denominator === 0) continue
    if (point.x < a.x + t / denominator) inside = !inside
  }
  return inside
}

/** Every corner of the box, which is what has to be inside, not just the centre. */
export function boxCorners(box: Box): PolygonPoint[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]
}

/**
 * True when the whole footprint sits inside the ring.
 *
 * Corners are tested a hair inward rather than exactly. A box slid until it
 * touches an edge is the correct answer to "fit this in", and testing the
 * corner exactly puts it on the boundary, where ray casting is entitled to say
 * either. Without the nudge, "move it inside" quietly became "shrink it",
 * because the moved box was judged to be still outside.
 */
export function boxInPolygon(box: Box, polygon: readonly PolygonPoint[]): boolean {
  const nudge = Math.min(box.width, box.height) * 1e-6
  const centreX = box.x + box.width / 2
  const centreY = box.y + box.height / 2
  return boxCorners(box).every(corner =>
    pointInPolygon(
      {
        x: corner.x + Math.sign(centreX - corner.x) * nudge,
        y: corner.y + Math.sign(centreY - corner.y) * nudge,
      },
      polygon,
    ),
  )
}

export interface FitOptions {
  /** Clear space to leave between the object and the outline, in inches. */
  margin?: number
  /** Never shrink below this, in inches. Smaller than this is not a spa. */
  minSize?: number
  /** Refuse to shrink at all, for callers that only want repositioning. */
  moveOnly?: boolean
}

export interface FitResult {
  box: Box
  /** What had to happen: nothing, a move, or a move and a shrink. */
  outcome: 'already-inside' | 'moved' | 'resized' | 'impossible'
  /** 1 when the size was kept. Less than 1 when it had to shrink. */
  scale: number
}

/**
 * Put `box` inside `polygon`, moving it and shrinking it only as much as needed.
 *
 * Three steps, in this order, because each one can make the next unnecessary.
 * Clamp into the ring's bounding box first, which is cheap and fixes the common
 * case of a drop that overshot an edge. Then, if any corner is still outside the
 * ring itself (a concave space, or an L-shaped deck), shrink about the object's
 * own centre and re-clamp. Shrinking is last because an object that fits should
 * never be resized: silently changing a spa's size when the user only meant to
 * move it would be worse than leaving it half out.
 *
 * Returns `impossible` rather than an unusable box when the space is smaller
 * than `minSize` allows, so the caller can say so instead of dropping a
 * one-inch spa into a puddle.
 */
export function fitBoxInPolygon(
  box: Box,
  polygon: readonly PolygonPoint[],
  options: FitOptions = {},
): FitResult {
  const margin = options.margin ?? 0
  const minSize = options.minSize ?? 6

  if (polygon.length < 3) return { box, outcome: 'impossible', scale: 1 }

  const bounds = polygonBounds(polygon)
  if (bounds.maxX - bounds.minX - margin * 2 < minSize) return { box, outcome: 'impossible', scale: 1 }
  if (bounds.maxY - bounds.minY - margin * 2 < minSize) return { box, outcome: 'impossible', scale: 1 }

  if (margin === 0 && boxInPolygon(box, polygon)) {
    return { box, outcome: 'already-inside', scale: 1 }
  }

  // Where to try putting it, best first. The drop point comes first because
  // that is what the user asked for; the rest are places inside the ring to
  // fall back to when the drop landed somewhere the ring does not go, like the
  // notch of an L-shaped deck.
  //
  // The centroid alone is not enough and is actively bad for an L: the centroid
  // of that shape sits in the corner of the notch, so a box centred there can
  // only be a couple of inches wide before it leaves the ring. Pulling toward
  // each vertex samples the arms, which is where the usable space actually is.
  const centroid = polygonCentroid(polygon)
  const centres: PolygonPoint[] = [
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    centroid,
    ...polygon.map(vertex => ({
      x: centroid.x + (vertex.x - centroid.x) * 0.5,
      y: centroid.y + (vertex.y - centroid.y) * 0.5,
    })),
  ]

  let scale = 1
  for (let step = 0; step < 24; step += 1) {
    const width = box.width * scale
    const height = box.height * scale
    if (width < minSize || height < minSize) break

    for (const centre of centres) {
      const candidate = clampInto(
        { x: centre.x - width / 2, y: centre.y - height / 2, width, height },
        bounds,
        margin,
      )
      if (!boxInPolygon(candidate, polygon)) continue
      const same =
        scale === 1 &&
        Math.abs(candidate.x - box.x) < 1e-9 &&
        Math.abs(candidate.y - box.y) < 1e-9
      if (same) return { box: candidate, outcome: 'already-inside', scale: 1 }
      // Moving is preferred to shrinking, and is reported as such, because an
      // object that fits should never come out a different size than it went in.
      return { box: candidate, outcome: scale === 1 ? 'moved' : 'resized', scale }
    }
    scale *= 0.9
  }

  return { box, outcome: 'impossible', scale: 1 }
}

/** Slide the box so it sits within `bounds`, without changing its size. */
function clampInto(
  box: Box,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  margin: number,
): Box {
  const minX = bounds.minX + margin
  const minY = bounds.minY + margin
  const maxX = bounds.maxX - margin - box.width
  const maxY = bounds.maxY - margin - box.height
  return {
    ...box,
    // max before min, so a box wider than the space ends up at the left edge
    // rather than at a negative position off the far side.
    x: Math.min(Math.max(box.x, minX), Math.max(maxX, minX)),
    y: Math.min(Math.max(box.y, minY), Math.max(maxY, minY)),
  }
}
