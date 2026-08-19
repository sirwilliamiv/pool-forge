// Footprint geometry for POLYGON_POOL and, later, any freeform footprint the
// image-ingestion pipeline produces.
//
// Points are `{ x, y }` objects (the `DesignIntent` and `PolygonPool` wire
// shape), distinct from `lib/geometry/polygon.ts`, which takes `[x, y]`
// tuples for the older non-rectangular pool helpers.
//
// Units, following the repo convention that state stores inches:
//   input points      -> inches
//   polygonArea       -> square feet
//   polygonPerimeter  -> linear feet
//   polygonBounds     -> inches (a position, not a measurement)
//   polygonCentroid   -> inches (a position, not a measurement)
//
// Everything here is pure: no state, no I/O, no model calls.

const INCHES_PER_FOOT = 12
const SQ_INCHES_PER_SQ_FOOT = 144

/** Below this, two coordinates are the same point and three are collinear. */
export const POLYGON_EPSILON = 1e-6

export interface PolygonPoint {
  x: number
  y: number
}

export interface PolygonBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

/**
 * Twice the signed shoelace area, in square inches. Positive is the winding we
 * call CCW throughout this module. A self-intersecting ring cancels against
 * itself here: that is the honest algebraic answer, and callers that care must
 * reject self-intersection before measuring.
 */
export function signedDoubleArea(points: readonly PolygonPoint[]): number {
  const n = points.length
  if (n < 3) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    if (!a || !b) continue
    sum += a.x * b.y - b.x * a.y
  }
  return sum
}

/** Absolute polygon area in square feet. Zero for fewer than 3 points. */
export function polygonArea(points: readonly PolygonPoint[]): number {
  return Math.abs(signedDoubleArea(points)) / 2 / SQ_INCHES_PER_SQ_FOOT
}

/** Closed-ring perimeter in linear feet. Zero for fewer than 2 points. */
export function polygonPerimeter(points: readonly PolygonPoint[]): number {
  const n = points.length
  if (n < 2) return 0
  // Two points describe a degenerate ring: out and back, so count the edge once.
  if (n === 2) {
    const a = points[0]
    const b = points[1]
    if (!a || !b) return 0
    return Math.hypot(b.x - a.x, b.y - a.y) / INCHES_PER_FOOT
  }
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    if (!a || !b) continue
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum / INCHES_PER_FOOT
}

/** Axis-aligned bounding box, in inches. All zeros for an empty ring. */
export function polygonBounds(points: readonly PolygonPoint[]): PolygonBounds {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * Area centroid, in inches. Falls back to the mean of the vertices when the
 * ring has zero area (a degenerate or collinear run), which keeps callers such
 * as label placement from producing NaN.
 */
export function polygonCentroid(points: readonly PolygonPoint[]): PolygonPoint {
  const n = points.length
  if (n === 0) return { x: 0, y: 0 }

  const doubleArea = signedDoubleArea(points)
  if (Math.abs(doubleArea) < POLYGON_EPSILON) {
    let sx = 0
    let sy = 0
    for (const p of points) {
      sx += p.x
      sy += p.y
    }
    return { x: sx / n, y: sy / n }
  }

  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    if (!a || !b) continue
    const cross = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  const denominator = 3 * doubleArea
  return { x: cx / denominator, y: cy / denominator }
}

/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
function distanceToLine(p: PolygonPoint, a: PolygonPoint, b: PolygonPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < POLYGON_EPSILON) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len
}

/**
 * Canonical form for a footprint ring:
 *
 *  1. consecutive duplicate points dropped,
 *  2. an explicit closing point equal to the first dropped (rings are implicit),
 *  3. collinear interior vertices dropped within `epsilon` inches,
 *  4. CCW winding (positive signed area) enforced.
 *
 * Returns the cleaned points untouched by steps 3 and 4 when fewer than three
 * survive: a point or a segment has no winding to enforce.
 */
export function normalizePolygon(
  points: readonly PolygonPoint[],
  epsilon: number = POLYGON_EPSILON,
): PolygonPoint[] {
  const deduped: PolygonPoint[] = []
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    const prev = deduped[deduped.length - 1]
    if (prev && Math.abs(prev.x - p.x) <= epsilon && Math.abs(prev.y - p.y) <= epsilon) continue
    deduped.push({ x: p.x, y: p.y })
  }

  while (deduped.length > 1) {
    const first = deduped[0]
    const last = deduped[deduped.length - 1]
    if (!first || !last) break
    if (Math.abs(first.x - last.x) <= epsilon && Math.abs(first.y - last.y) <= epsilon) {
      deduped.pop()
      continue
    }
    break
  }

  if (deduped.length < 3) return deduped

  // Drop collinear vertices, repeatedly: removing one can expose another.
  let ring = deduped
  let changed = true
  while (changed && ring.length > 3) {
    changed = false
    const kept: PolygonPoint[] = []
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i - 1 + ring.length) % ring.length]
      const cur = ring[i]
      const next = ring[(i + 1) % ring.length]
      if (!prev || !cur || !next) continue
      if (kept.length + (ring.length - i - 1) < 3) {
        kept.push(cur)
        continue
      }
      if (distanceToLine(cur, prev, next) <= epsilon) {
        changed = true
        continue
      }
      kept.push(cur)
    }
    if (kept.length < 3) return ring
    ring = kept
  }

  if (ring.length < 3) return ring
  return signedDoubleArea(ring) < 0 ? [...ring].reverse() : ring
}

/**
 * True when any pair of non-adjacent edges crosses. O(n²), which is fine for
 * footprints: an extracted pool ring is tens of points, never thousands.
 */
export function isSelfIntersecting(points: readonly PolygonPoint[]): boolean {
  const n = points.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share a vertex by construction; skip them.
      if (j === i || (i === 0 && j === n - 1) || j === i + 1) continue
      const a1 = points[i]
      const a2 = points[(i + 1) % n]
      const b1 = points[j]
      const b2 = points[(j + 1) % n]
      if (!a1 || !a2 || !b1 || !b2) continue
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

function cross(o: PolygonPoint, a: PolygonPoint, b: PolygonPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function segmentsIntersect(
  a1: PolygonPoint,
  a2: PolygonPoint,
  b1: PolygonPoint,
  b2: PolygonPoint,
): boolean {
  const d1 = cross(a1, a2, b1)
  const d2 = cross(a1, a2, b2)
  const d3 = cross(b1, b2, a1)
  const d4 = cross(b1, b2, a2)
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
}
