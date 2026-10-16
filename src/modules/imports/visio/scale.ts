// Drawing inches to real inches. Pure.
//
// Rings are kept with the footprint's bounding-box top-left at the origin, the
// shape `PolygonPool.points` and `SketchPath.points` already use.

import { polygonBounds } from '@/lib/geometry/polygon-footprint'
import type { Ring } from './types'

/** Six decimals keeps JSON short and integer corners integer at any listed scale. */
const ROUND_FACTOR = 1e6

function round(value: number): number {
  const r = Math.round(value * ROUND_FACTOR) / ROUND_FACTOR
  return Object.is(r, -0) ? 0 : r
}

export interface Normalized {
  rings: Ring[]
  widthIn: number
  heightIn: number
}

function measure(rings: Ring[]): Normalized {
  const b = polygonBounds(rings[0] ?? [])
  return { rings, widthIn: round(b.width), heightIn: round(b.height) }
}

/** Translate so the footprint's bounding-box top-left is (0, 0). Drawing inches in, drawing inches out. */
export function normalizeRings(rings: Ring[]): Normalized {
  const b = polygonBounds(rings[0] ?? [])
  return measure(rings.map(ring => ring.map(p => ({ x: round(p.x - b.minX), y: round(p.y - b.minY) }))))
}

/** Multiply by `inchesPerInch`. Call on already normalized rings; the origin stays at (0, 0). */
export function scaleRings(rings: Ring[], inchesPerInch: number): Normalized {
  return measure(rings.map(ring => ring.map(p => ({ x: round(p.x * inchesPerInch), y: round(p.y * inchesPerInch) }))))
}
