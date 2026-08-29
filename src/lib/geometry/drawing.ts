// The maths behind drawing in plan.
//
// A pool designer's habit is a 2D one: draw the house, the lot line, the deck,
// then the pool, fast, on a grid, and let the 3D fall out of it afterwards.
// These are the pure pieces that habit needs. Nothing here touches React, a
// camera, or a store, so all of it is testable without a browser.
//
// Everything is in inches, matching the rest of the editor. Feet appear only in
// labels.

export interface Point {
  x: number
  y: number
}

/**
 * Grid spacings a builder actually works to, coarse to fine.
 *
 * Not an arbitrary slider. A pool plan is dimensioned in feet and inches, so
 * the useful spacings are the ones a tape measure has: a foot for laying out a
 * deck, three inches for a coping course, five feet for placing a whole pool on
 * a lot. Offering 7.3 inches would be offering a mistake.
 */
export const GRID_SPACINGS = [
  { id: 'fine', label: '3 in', inches: 3 },
  { id: 'small', label: '6 in', inches: 6 },
  { id: 'foot', label: '1 ft', inches: 12 },
  { id: 'medium', label: '2 ft', inches: 24 },
  { id: 'large', label: '5 ft', inches: 60 },
] as const

export type GridSpacingId = (typeof GRID_SPACINGS)[number]['id']

export const DEFAULT_GRID: GridSpacingId = 'foot'

export function gridInches(id: GridSpacingId): number {
  return GRID_SPACINGS.find(spacing => spacing.id === id)?.inches ?? 12
}

/** Round to the nearest multiple of `spacing`. A spacing of zero snaps nothing. */
export function snapValue(value: number, spacing: number): number {
  if (!Number.isFinite(value)) return value
  if (spacing <= 0) return value
  return Math.round(value / spacing) * spacing
}

export function snapPoint(point: Point, spacing: number): Point {
  return { x: snapValue(point.x, spacing), y: snapValue(point.y, spacing) }
}

export function snapPath(points: readonly Point[], spacing: number): Point[] {
  return points.map(point => snapPoint(point, spacing))
}

/**
 * Constrain a segment to horizontal, vertical or 45 degrees.
 *
 * What holding shift does in every drawing tool ever made. Compares the run and
 * the rise rather than the angle, so a segment that is very nearly horizontal
 * becomes exactly horizontal instead of nearly so, which is the whole point:
 * "nearly straight" is what makes a plan look hand-drawn.
 */
export function orthoConstrain(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)

  // Close enough to the diagonal that the user meant the diagonal.
  const diagonal = Math.min(ax, ay) / Math.max(ax, ay, 1) > 0.4142
  if (diagonal) {
    const run = (ax + ay) / 2
    return { x: from.x + Math.sign(dx) * run, y: from.y + Math.sign(dy) * run }
  }
  return ax >= ay ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Perpendicular distance from `point` to the line through `a` and `b`. */
function perpendicularDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return distance(point, a)
  const numerator = Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x)
  return numerator / Math.hypot(dx, dy)
}

/**
 * Ramer-Douglas-Peucker: drop the points that were never decisions.
 *
 * A freehand drag arrives as hundreds of samples describing what is really four
 * or five corners. Keeping all of them would make every later operation (snap,
 * label, area, the 3D extrusion) work on noise, and would put a vertex handle
 * every two pixels along an edge nobody wants to edit.
 *
 * `tolerance` is in inches: a point further than this from the line between its
 * neighbours is a corner and survives.
 */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points]
  if (tolerance <= 0) return [...points]

  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return [...points]

  let worst = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i]
    if (!point) continue
    const d = perpendicularDistance(point, first, last)
    if (d > worst) {
      worst = d
      index = i
    }
  }

  if (worst <= tolerance) return [first, last]

  const left = simplify(points.slice(0, index + 1), tolerance)
  const right = simplify(points.slice(index), tolerance)
  // `index` is in both halves; drop the duplicate seam.
  return [...left.slice(0, -1), ...right]
}

/**
 * Whether a path's ends are close enough to be one closed outline.
 *
 * Drawing a pool by hand never returns exactly to the start. Anything inside
 * `tolerance` is treated as meant-to-close, which is what lets a freehand loop
 * become a footprint with an area rather than a very long open squiggle.
 */
export function isClosed(points: readonly Point[], tolerance: number): boolean {
  if (points.length < 3) return false
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return false
  return distance(first, last) <= tolerance
}

/** Drop the duplicated end point of a closed ring, so each vertex appears once. */
export function closeRing(points: readonly Point[], tolerance: number): Point[] {
  if (!isClosed(points, tolerance)) return [...points]
  return points.slice(0, -1)
}

/**
 * Remove consecutive duplicates, which snapping creates in bulk.
 *
 * Snapping a freehand drag to a one-foot grid maps whole runs of samples onto
 * the same grid intersection. Left in, a 40-point outline becomes 40 vertices
 * sitting on top of each other, and the polygon has zero-length edges that
 * break area and normal calculations downstream.
 */
export function dedupe(points: readonly Point[], epsilon = 1e-6): Point[] {
  const out: Point[] = []
  for (const point of points) {
    const previous = out[out.length - 1]
    if (previous && Math.abs(previous.x - point.x) <= epsilon && Math.abs(previous.y - point.y) <= epsilon) {
      continue
    }
    out.push(point)
  }
  return out
}

/**
 * Sample a quadratic Bézier into line segments.
 *
 * Curves are stored as control points and drawn as segments, because everything
 * downstream (area, perimeter, the 3D footprint, the construction sheet) already
 * speaks polygons. Converting once here means none of them need to learn about
 * curves.
 */
export function sampleQuadratic(from: Point, control: Point, to: Point, segments = 16): Point[] {
  const count = Math.max(1, Math.floor(segments))
  const out: Point[] = []
  for (let i = 0; i <= count; i += 1) {
    const t = i / count
    const inverse = 1 - t
    out.push({
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
    })
  }
  return out
}

/**
 * An arc through three points, as segments.
 *
 * The click-click-click gesture people expect from a curve tool: two ends and a
 * point the curve passes through. Collinear points have no circle through them,
 * and the honest answer there is the straight line, not a division by zero.
 */
export function sampleArc(from: Point, through: Point, to: Point, segments = 24): Point[] {
  const ax = from.x
  const ay = from.y
  const bx = through.x
  const by = through.y
  const cx = to.x
  const cy = to.y

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-9) return [from, to]

  const ux =
    ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d

  const centre = { x: ux, y: uy }
  const radius = distance(centre, from)
  if (!Number.isFinite(radius) || radius === 0) return [from, to]

  const angleOf = (point: Point): number => Math.atan2(point.y - centre.y, point.x - centre.x)
  const start = angleOf(from)
  const mid = angleOf(through)
  const end = angleOf(to)

  // Walk the way round that actually passes through the middle point.
  let sweep = end - start
  while (sweep <= -Math.PI) sweep += 2 * Math.PI
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  let midSweep = mid - start
  while (midSweep <= -Math.PI) midSweep += 2 * Math.PI
  while (midSweep > Math.PI) midSweep -= 2 * Math.PI
  if (Math.sign(midSweep) !== Math.sign(sweep) || Math.abs(midSweep) > Math.abs(sweep)) {
    sweep = sweep > 0 ? sweep - 2 * Math.PI : sweep + 2 * Math.PI
  }

  const count = Math.max(1, Math.floor(segments))
  const out: Point[] = []
  for (let i = 0; i <= count; i += 1) {
    const angle = start + (sweep * i) / count
    out.push({ x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) })
  }
  return out
}

/**
 * Everything a freehand drag has to go through before it is a shape.
 *
 * Order matters and is the whole trick. Simplify first, while the samples still
 * describe the curve faithfully: snapping first would quantise the noise and
 * then preserve it as real corners. Snap second, so the corners that survived
 * land on the grid. Dedupe last, because snapping is what creates the
 * duplicates.
 */
export function tidyFreehand(
  points: readonly Point[],
  options: { tolerance: number; spacing: number },
): Point[] {
  const simplified = simplify(points, options.tolerance)
  const snapped = options.spacing > 0 ? snapPath(simplified, options.spacing) : simplified
  return dedupe(snapped)
}
