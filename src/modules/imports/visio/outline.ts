// Flattened paths to one footprint ring plus detail. Pure.
//
// A master's filled closed subpaths are unioned; the largest polygon of the
// union is the footprint and everything else (other islands, holes) is detail
// for the thumbnail. A master with nothing filled falls back to its closed
// stroke-only subpaths, which is how some stencils draw an outline.

import polygonClipping, { type Pair, type Polygon } from 'polygon-clipping'
import { normalizePolygon, signedDoubleArea } from '@/lib/geometry/polygon-footprint'
import { DEFAULT_FILL, DEFAULT_STROKE, type FlatPath, type Outline, type Ring, type RawStyle, type Subpath } from './types'

const HEX_COLOR = /^#[0-9a-f]{6}$/

type Pick = (style: RawStyle, sub: Subpath) => boolean

/** In order: what fill paints (SVG fill closes an open subpath), closed strokes, then open strokes of three or more points. */
const TIERS: readonly Pick[] = [
  (style) => style.fill,
  (style, sub) => style.stroke && sub.closed,
  (style) => style.stroke,
]

function ringsFor(paths: FlatPath[], pick: Pick): Ring[] {
  const rings: Ring[] = []
  for (const path of paths) {
    for (const sub of path.subpaths) {
      if (sub.points.length >= 3 && pick(path.style, sub)) rings.push(sub.points)
    }
  }
  return rings
}

function toPolygon(ring: Ring): Polygon {
  return [ring.map((p): Pair => [p.x, p.y])]
}

function fromPairs(pairs: Pair[]): Ring {
  const ring = pairs.map(([x, y]) => ({ x, y }))
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (ring.length > 1 && first && last && first.x === last.x && first.y === last.y) ring.pop()
  return ring
}

function validColor(value: string | null | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback
}

export function outlineOf(paths: FlatPath[]): Outline | null {
  let rings: Ring[] = []
  for (const pick of TIERS) {
    rings = ringsFor(paths, pick)
    if (rings.length > 0) break
  }
  if (rings.length === 0) return null

  const [head, ...rest] = rings.map(toPolygon)
  if (!head) return null
  let merged: Pair[][][]
  try {
    merged = polygonClipping.union(head, ...rest)
  } catch {
    return null
  }

  let footprint: Ring | null = null
  let footprintArea = 0
  const detail: Ring[] = []
  for (const polygon of merged) {
    for (const [i, pairs] of polygon.entries()) {
      const ring = fromPairs(pairs)
      if (ring.length < 3) continue
      if (i > 0) {
        detail.push(ring)
        continue
      }
      const area = Math.abs(signedDoubleArea(ring))
      if (footprint === null || area > footprintArea) {
        if (footprint !== null) detail.push(footprint)
        footprint = ring
        footprintArea = area
      } else {
        detail.push(ring)
      }
    }
  }
  if (!footprint) return null

  const normalized = normalizePolygon(footprint)
  if (normalized.length < 3) return null

  const filled = paths.find(p => p.style.fill)
  const stroked = paths.find(p => p.style.stroke)
  return {
    footprint: normalized,
    detail,
    fill: validColor(filled?.style.fillColor, DEFAULT_FILL),
    stroke: validColor(stroked?.style.strokeColor, DEFAULT_STROKE),
  }
}
