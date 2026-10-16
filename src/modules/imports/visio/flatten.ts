// Paths of lines, arcs and curves to polylines. Pure.
//
// Arcs use the SVG endpoint-to-centre conversion (SVG 1.1, appendix F.6.5).
// Quadratic and cubic curves are subdivided by de Casteljau until the control
// hull is within the tolerance of its chord.

import {
  FLATTEN_TOLERANCE_IN,
  type FlatPath,
  type RawMaster,
  type RawPath,
  type RawPoint,
  type Subpath,
} from './types'

/** Two points closer than this are the same point. */
const SAME_POINT = 1e-9
const MIN_ARC_SAMPLES = 4
const MAX_ARC_SAMPLES = 1024
const MAX_CURVE_DEPTH = 16
const MIN_RING_POINTS = 3

function same(a: RawPoint, b: RawPoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < SAME_POINT
}

function angle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1
  const dot = ux * vx + uy * vy
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  if (len === 0) return 0
  return sign * Math.acos(Math.max(-1, Math.min(1, dot / len)))
}

interface ArcInput {
  rx: number
  ry: number
  rotate: number
  largeArc: boolean
  sweep: boolean
  x: number
  y: number
}

/** Points along the arc from `from`, excluding `from`, including the end point. */
export function arcPoints(from: RawPoint, arc: ArcInput, tolerance: number): RawPoint[] {
  const end = { x: arc.x, y: arc.y }
  let rx = Math.abs(arc.rx)
  let ry = Math.abs(arc.ry)
  if (rx < SAME_POINT || ry < SAME_POINT || same(from, end)) return [end]

  const phi = (arc.rotate * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from.x - end.x) / 2
  const dy = (from.y - end.y) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy

  // Radii too small to reach the end point: scale them up uniformly.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const k = Math.sqrt(lambda)
    rx *= k
    ry *= k
  }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coefSign = arc.largeArc !== arc.sweep ? 1 : -1
  const coef = den === 0 ? 0 : coefSign * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (from.x + end.x) / 2
  const cy = sin * cxp + cos * cyp + (from.y + end.y) / 2

  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry
  const theta1 = angle(1, 0, ux, uy)
  let delta = angle(ux, uy, vx, vy)
  if (!arc.sweep && delta > 0) delta -= 2 * Math.PI
  if (arc.sweep && delta < 0) delta += 2 * Math.PI

  const rMax = Math.max(rx, ry)
  const tol = Math.min(tolerance, rMax)
  const step = 2 * Math.acos(1 - tol / rMax)
  const wanted = step > 0 ? Math.ceil(Math.abs(delta) / step) : MAX_ARC_SAMPLES
  const n = Math.min(MAX_ARC_SAMPLES, Math.max(MIN_ARC_SAMPLES, wanted))

  const points: RawPoint[] = []
  for (let i = 1; i < n; i++) {
    const t = theta1 + (delta * i) / n
    const ex = rx * Math.cos(t)
    const ey = ry * Math.sin(t)
    points.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy })
  }
  points.push(end)
  return points
}

function distanceToChord(p: RawPoint, a: RawPoint, b: RawPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < SAME_POINT) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len
}

function mid(a: RawPoint, b: RawPoint): RawPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Cubic de Casteljau, appending every point after `p0` to `out`. */
function cubic(
  p0: RawPoint,
  p1: RawPoint,
  p2: RawPoint,
  p3: RawPoint,
  tolerance: number,
  depth: number,
  out: RawPoint[],
): void {
  const flat = Math.max(distanceToChord(p1, p0, p3), distanceToChord(p2, p0, p3)) <= tolerance
  if (flat || depth >= MAX_CURVE_DEPTH) {
    out.push(p3)
    return
  }
  const p01 = mid(p0, p1)
  const p12 = mid(p1, p2)
  const p23 = mid(p2, p3)
  const p012 = mid(p01, p12)
  const p123 = mid(p12, p23)
  const m = mid(p012, p123)
  cubic(p0, p01, p012, m, tolerance, depth + 1, out)
  cubic(m, p123, p23, p3, tolerance, depth + 1, out)
}

function quadratic(p0: RawPoint, p1: RawPoint, p2: RawPoint, tolerance: number, out: RawPoint[]): void {
  // Degree elevation: a quadratic is a cubic with these two control points.
  const c1 = { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) }
  const c2 = { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) }
  cubic(p0, c1, c2, p2, tolerance, 0, out)
}

function finish(points: RawPoint[], closedByZ: boolean): Subpath | null {
  const clean: RawPoint[] = []
  for (const p of points) {
    const prev = clean[clean.length - 1]
    if (prev && same(prev, p)) continue
    clean.push(p)
  }
  let closed = closedByZ
  const first = clean[0]
  const last = clean[clean.length - 1]
  if (clean.length > 1 && first && last && same(first, last)) {
    clean.pop()
    closed = true
  }
  if (clean.length < MIN_RING_POINTS) return null
  return { points: clean, closed }
}

export function flattenPath(path: RawPath, tolerance: number = FLATTEN_TOLERANCE_IN): FlatPath {
  const subpaths: Subpath[] = []
  let points: RawPoint[] = []
  let current: RawPoint | null = null
  let start: RawPoint | null = null

  const flush = (closedByZ: boolean): void => {
    if (points.length > 0) {
      const sub = finish(points, closedByZ)
      if (sub) subpaths.push(sub)
    }
    points = []
  }

  // A drawing segment after Z without a fresh M starts again from the subpath start.
  const resume = (): void => {
    if (points.length === 0 && current) points.push(current)
  }

  for (const seg of path.segments) {
    switch (seg.action) {
      case 'M': {
        flush(false)
        current = { x: seg.x, y: seg.y }
        start = current
        points.push(current)
        break
      }
      case 'L': {
        resume()
        current = { x: seg.x, y: seg.y }
        points.push(current)
        break
      }
      case 'A': {
        resume()
        const from = current ?? { x: seg.x, y: seg.y }
        if (!current) points.push(from)
        points.push(...arcPoints(from, seg, tolerance))
        current = { x: seg.x, y: seg.y }
        break
      }
      case 'Q': {
        resume()
        const from = current ?? { x: seg.x, y: seg.y }
        if (!current) points.push(from)
        quadratic(from, { x: seg.x1, y: seg.y1 }, { x: seg.x, y: seg.y }, tolerance, points)
        current = { x: seg.x, y: seg.y }
        break
      }
      case 'C': {
        resume()
        const from = current ?? { x: seg.x, y: seg.y }
        if (!current) points.push(from)
        cubic(
          from,
          { x: seg.x1, y: seg.y1 },
          { x: seg.x2, y: seg.y2 },
          { x: seg.x, y: seg.y },
          tolerance,
          0,
          points,
        )
        current = { x: seg.x, y: seg.y }
        break
      }
      case 'Z': {
        flush(true)
        current = start
        break
      }
    }
  }
  flush(false)

  return { style: { ...path.style }, subpaths }
}

export function flattenMaster(master: RawMaster, tolerance: number = FLATTEN_TOLERANCE_IN): FlatPath[] {
  return master.paths.map(p => flattenPath(p, tolerance)).filter(p => p.subpaths.length > 0)
}
