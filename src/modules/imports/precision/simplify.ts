// Polygon cleanup. The vision model returns a coarse, jittery trace; these
// functions turn it into something a builder would accept as a drawing.
//
// Everything works on `{ x, y }` points (the `DesignIntent` wire shape) and is
// unit agnostic: feed pixels here, convert to inches once scale is resolved.

import type { Point } from '../intent'

/** Two coordinates closer than this are the same point. */
export const POINT_EPSILON = 1e-9

function copy(points: readonly Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y }))
}

function samePoint(a: Point, b: Point, epsilon = POINT_EPSILON): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
}

/** Drops non-finite points and consecutive duplicates. Does not close the ring. */
export function dedupePoints(points: readonly Point[], epsilon = POINT_EPSILON): Point[] {
  const out: Point[] = []
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    const prev = out[out.length - 1]
    if (prev && samePoint(prev, p, epsilon)) continue
    out.push({ x: p.x, y: p.y })
  }
  return out
}

/** Perpendicular distance to the segment ab, falling back to |p - a| when ab is degenerate. */
export function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq <= POINT_EPSILON) return Math.hypot(p.x - a.x, p.y - a.y)
  const cross = Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x))
  return cross / Math.sqrt(lengthSq)
}

/**
 * Douglas-Peucker simplification of an open polyline, keeping both endpoints.
 *
 * Iterative on an explicit stack rather than recursive: a model that returns a
 * few thousand near-collinear points would otherwise be able to blow the call
 * stack, and an input we do not control must never be able to do that.
 */
export function douglasPeucker(points: readonly Point[], epsilonPx: number): Point[] {
  if (points.length <= 2) return copy(points)
  if (!(epsilonPx > 0)) return copy(points)

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const range = stack.pop()
    if (!range) break
    const [start, end] = range
    if (end - start < 2) continue
    const a = points[start]
    const b = points[end]
    if (!a || !b) continue

    let farthest = -1
    let maxDistance = 0
    for (let i = start + 1; i < end; i++) {
      const p = points[i]
      if (!p) continue
      const distance = perpendicularDistance(p, a, b)
      if (distance > maxDistance) {
        maxDistance = distance
        farthest = i
      }
    }

    if (farthest >= 0 && maxDistance > epsilonPx) {
      keep[farthest] = 1
      stack.push([start, farthest])
      stack.push([farthest, end])
    }
  }

  const out: Point[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (keep[i] === 1 && p) out.push({ x: p.x, y: p.y })
  }
  return out
}

/**
 * Douglas-Peucker for a closed ring, where "keep the endpoints" is meaningless
 * because there are none.
 *
 * The ring is first rotated to start at its lexicographically smallest vertex,
 * then split at the vertex farthest from that one and simplified as two chains.
 * Both anchors are properties of the shape rather than of the input ordering,
 * so the same outline traced from a different starting point simplifies to the
 * same polygon. Without that, the vertex the model happened to emit first would
 * be pinned into the result and the answer would wobble between runs.
 */
export function simplifyRing(points: readonly Point[], epsilonPx: number): Point[] {
  const closed = closeRing(dedupePoints(points))
  if (closed.length <= 3) return closed
  if (!(epsilonPx > 0)) return closed

  const ring = rotateToCanonicalStart(closed)
  const first = ring[0]!
  let anchor = 0
  let maxDistance = -1
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i]!
    const distance = Math.hypot(p.x - first.x, p.y - first.y)
    if (distance > maxDistance) {
      maxDistance = distance
      anchor = i
    }
  }

  const chainA = ring.slice(0, anchor + 1)
  const chainB = ring.slice(anchor).concat([first])
  const simplifiedA = douglasPeucker(chainA, epsilonPx)
  const simplifiedB = douglasPeucker(chainB, epsilonPx)
  // Both chains carry the shared anchor and the shared start point; drop the
  // duplicates rather than leaving a zero-length edge behind.
  return closeRing(simplifiedA.concat(simplifiedB.slice(1, -1)))
}

/** Rotates a ring to start at its lowest x, then lowest y, vertex. */
export function rotateToCanonicalStart(points: readonly Point[]): Point[] {
  if (points.length < 2) return copy(points)
  let start = 0
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const best = points[start]!
    if (p.x < best.x || (p.x === best.x && p.y < best.y)) start = i
  }
  return copy(points.slice(start).concat(points.slice(0, start)))
}

/** Removes a trailing repeat of the first point, so the ring is implicit. */
export function closeRing(points: readonly Point[], epsilon = POINT_EPSILON): Point[] {
  const out = dedupePoints(points, epsilon)
  while (out.length > 1) {
    const first = out[0]!
    const last = out[out.length - 1]!
    if (!samePoint(first, last, epsilon)) break
    out.pop()
  }
  return out
}

class UnionFind {
  private readonly parent: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i)
  }

  find(a: number): number {
    let root = a
    while (this.parent[root] !== root) root = this.parent[root]!
    let node = a
    while (this.parent[node] !== root) {
      const next = this.parent[node]!
      this.parent[node] = root
      node = next
    }
    return root
  }

  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

/**
 * Makes near-horizontal and near-vertical edges exactly axis aligned.
 *
 * The naive version rewrites each edge in turn, which drifts: edge 1 sets its
 * end vertex's y, edge 2 then overwrites the same vertex's y, and the ring ends
 * up with a gap where it started. Instead this collects the vertices that a run
 * of horizontal edges forces onto one y (and vertical edges onto one x) into
 * union-find groups and gives every member of a group the group's mean
 * coordinate. Vertices move, edges are never rewritten, so the ring stays
 * closed by construction and no error accumulates around it.
 */
export function snapToAxis(points: readonly Point[], toleranceDeg: number): Point[] {
  const ring = copy(points)
  const n = ring.length
  if (n < 2) return ring
  if (!(toleranceDeg > 0)) return ring

  const tolerance = Math.tan((Math.min(44.9, toleranceDeg) * Math.PI) / 180)
  const xGroups = new UnionFind(n)
  const yGroups = new UnionFind(n)

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const a = ring[i]!
    const b = ring[j]!
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    if (dx <= POINT_EPSILON && dy <= POINT_EPSILON) continue
    if (dy <= dx * tolerance) {
      yGroups.union(i, j)
    } else if (dx <= dy * tolerance) {
      xGroups.union(i, j)
    }
  }

  applyGroupMean(ring, xGroups, 'x')
  applyGroupMean(ring, yGroups, 'y')
  return ring
}

function applyGroupMean(ring: Point[], groups: UnionFind, axis: 'x' | 'y'): void {
  const sums = new Map<number, { total: number; count: number }>()
  for (let i = 0; i < ring.length; i++) {
    const root = groups.find(i)
    const entry = sums.get(root)
    const value = ring[i]![axis]
    if (entry) {
      entry.total += value
      entry.count++
    } else {
      sums.set(root, { total: value, count: 1 })
    }
  }
  for (let i = 0; i < ring.length; i++) {
    const entry = sums.get(groups.find(i))
    if (!entry || entry.count < 2) continue
    ring[i]![axis] = entry.total / entry.count
  }
}

/**
 * Snaps vertices onto the detected grid.
 *
 * Each axis is considered independently: a vertex 1px from a vertical rule but
 * 40px from any horizontal one still gains from having its x snapped, and
 * insisting on a full intersection would throw that alignment away. A vertex
 * near an intersection therefore lands exactly on it, which is the case the
 * spec cares about.
 */
export function snapToGrid(
  points: readonly Point[],
  pitchPx: number,
  originOffsetPx: Point,
  maxSnapPx: number,
): Point[] {
  const out = copy(points)
  if (!(pitchPx > 0) || !(maxSnapPx > 0)) return out
  if (!Number.isFinite(originOffsetPx.x) || !Number.isFinite(originOffsetPx.y)) return out

  for (const p of out) {
    const snappedX = originOffsetPx.x + Math.round((p.x - originOffsetPx.x) / pitchPx) * pitchPx
    const snappedY = originOffsetPx.y + Math.round((p.y - originOffsetPx.y) / pitchPx) * pitchPx
    if (Math.abs(snappedX - p.x) <= maxSnapPx) p.x = snappedX
    if (Math.abs(snappedY - p.y) <= maxSnapPx) p.y = snappedY
  }
  return out
}

/**
 * Caps the vertex count, dropping the vertices that matter least first.
 *
 * Visvalingam-Whyatt rather than a second Douglas-Peucker pass: it removes by
 * the area of the triangle a vertex forms with its neighbours, which is exactly
 * "how much of the silhouette does dropping this cost", and it lets us hit an
 * exact target count instead of guessing an epsilon that lands near one.
 */
export function resamplePolygon(points: readonly Point[], maxPoints: number): Point[] {
  const ring = closeRing(points)
  const target = Math.max(3, Math.floor(maxPoints))
  if (ring.length <= target) return ring

  const alive = ring.map((p) => ({ x: p.x, y: p.y }))
  while (alive.length > target) {
    let victim = -1
    let minArea = Infinity
    for (let i = 0; i < alive.length; i++) {
      const prev = alive[(i - 1 + alive.length) % alive.length]!
      const here = alive[i]!
      const next = alive[(i + 1) % alive.length]!
      const area = Math.abs(
        (here.x - prev.x) * (next.y - prev.y) - (next.x - prev.x) * (here.y - prev.y),
      )
      if (area < minArea) {
        minArea = area
        victim = i
      }
    }
    if (victim < 0) break
    alive.splice(victim, 1)
  }
  return alive
}

/** Axis-aligned bounds of a point set. Zero-sized for an empty set. */
export function boundsOf(points: readonly Point[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} {
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
