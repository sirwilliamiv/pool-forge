import { describe, expect, it } from 'vitest'

import {
  isSelfIntersecting,
  normalizePolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  polygonPerimeter,
  signedDoubleArea,
  type PolygonPoint,
} from '@/lib/geometry/polygon-footprint'
import { rectangleAreaSqft, rectanglePerimeterLf } from '@/lib/geometry/rectangle'

function pt(x: number, y: number): PolygonPoint {
  return { x, y }
}

const SQUARE_12IN: PolygonPoint[] = [pt(0, 0), pt(12, 0), pt(12, 12), pt(0, 12)]

describe('polygonArea', () => {
  it('a 12in square is 1 sqft', () => {
    expect(polygonArea(SQUARE_12IN)).toBeCloseTo(1, 9)
  })

  it('matches the rectangle helper for a rectangular ring', () => {
    const w = 25 * 12
    const h = 12 * 12
    const rect = [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)]
    expect(polygonArea(rect)).toBeCloseTo(rectangleAreaSqft(w, h), 9)
    expect(polygonPerimeter(rect)).toBeCloseTo(rectanglePerimeterLf(w, h), 9)
  })

  it('is winding independent', () => {
    expect(polygonArea([...SQUARE_12IN].reverse())).toBeCloseTo(1, 9)
  })

  it('is zero for fewer than three points', () => {
    expect(polygonArea([])).toBe(0)
    expect(polygonArea([pt(0, 0)])).toBe(0)
    expect(polygonArea([pt(0, 0), pt(12, 0)])).toBe(0)
  })

  it('is zero for a fully collinear run', () => {
    expect(polygonArea([pt(0, 0), pt(12, 0), pt(24, 0), pt(36, 0)])).toBe(0)
  })

  it('is zero for a ring of coincident points', () => {
    expect(polygonArea([pt(5, 5), pt(5, 5), pt(5, 5)])).toBe(0)
  })

  it('cancels algebraically for a symmetric bowtie', () => {
    // A self-intersecting ring: the two lobes wind opposite ways and cancel.
    const bowtie = [pt(0, 0), pt(12, 12), pt(12, 0), pt(0, 12)]
    expect(isSelfIntersecting(bowtie)).toBe(true)
    expect(polygonArea(bowtie)).toBeCloseTo(0, 9)
  })

  it('an L shape measures its silhouette, not its bounding box', () => {
    // 24x24 outer box with a 12x12 bite taken out of one corner.
    const lShape = [pt(0, 0), pt(24, 0), pt(24, 12), pt(12, 12), pt(12, 24), pt(0, 24)]
    expect(polygonArea(lShape)).toBeCloseTo(3, 9)
    const bounds = polygonBounds(lShape)
    expect(rectangleAreaSqft(bounds.width, bounds.height)).toBeCloseTo(4, 9)
  })
})

describe('polygonPerimeter', () => {
  it('a 12in square is 4 lf', () => {
    expect(polygonPerimeter(SQUARE_12IN)).toBeCloseTo(4, 9)
  })

  it('a two-point ring counts its single edge once', () => {
    expect(polygonPerimeter([pt(0, 0), pt(12, 0)])).toBeCloseTo(1, 9)
  })

  it('is zero for zero or one point', () => {
    expect(polygonPerimeter([])).toBe(0)
    expect(polygonPerimeter([pt(3, 4)])).toBe(0)
  })

  it('closes a 3-4-5 triangle', () => {
    expect(polygonPerimeter([pt(0, 0), pt(36, 0), pt(0, 48)])).toBeCloseTo(12, 9)
  })
})

describe('polygonBounds', () => {
  it('is all zeros for an empty ring', () => {
    expect(polygonBounds([])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    })
  })

  it('covers negative coordinates', () => {
    const b = polygonBounds([pt(-24, -12), pt(12, -12), pt(12, 36)])
    expect(b).toEqual({ minX: -24, minY: -12, maxX: 12, maxY: 36, width: 36, height: 48 })
  })
})

describe('polygonCentroid', () => {
  it('centers a square', () => {
    const c = polygonCentroid(SQUARE_12IN)
    expect(c.x).toBeCloseTo(6, 9)
    expect(c.y).toBeCloseTo(6, 9)
  })

  it('is winding independent', () => {
    const c = polygonCentroid([...SQUARE_12IN].reverse())
    expect(c.x).toBeCloseTo(6, 9)
    expect(c.y).toBeCloseTo(6, 9)
  })

  it('falls back to the vertex mean for a zero-area ring rather than NaN', () => {
    const c = polygonCentroid([pt(0, 0), pt(12, 0), pt(24, 0)])
    expect(c.x).toBeCloseTo(12, 9)
    expect(c.y).toBeCloseTo(0, 9)
    expect(Number.isNaN(c.x)).toBe(false)
  })

  it('is the origin for an empty ring', () => {
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 })
  })
})

describe('normalizePolygon', () => {
  it('drops an explicit closing point', () => {
    const closed = [...SQUARE_12IN, pt(0, 0)]
    expect(normalizePolygon(closed)).toHaveLength(4)
  })

  it('drops consecutive duplicates', () => {
    const dupes = [pt(0, 0), pt(0, 0), pt(12, 0), pt(12, 12), pt(12, 12), pt(0, 12)]
    expect(normalizePolygon(dupes)).toHaveLength(4)
  })

  it('drops collinear midpoints', () => {
    const withMidpoints = [
      pt(0, 0),
      pt(6, 0),
      pt(12, 0),
      pt(12, 6),
      pt(12, 12),
      pt(6, 12),
      pt(0, 12),
      pt(0, 6),
    ]
    const normalized = normalizePolygon(withMidpoints)
    expect(normalized).toHaveLength(4)
    expect(polygonArea(normalized)).toBeCloseTo(1, 9)
  })

  it('drops a run of several collinear points, not just one', () => {
    const run = [pt(0, 0), pt(3, 0), pt(6, 0), pt(9, 0), pt(12, 0), pt(12, 12), pt(0, 12)]
    expect(normalizePolygon(run)).toHaveLength(4)
  })

  it('enforces positive signed area', () => {
    const clockwise = [...SQUARE_12IN].reverse()
    expect(signedDoubleArea(clockwise)).toBeLessThan(0)
    expect(signedDoubleArea(normalizePolygon(clockwise))).toBeGreaterThan(0)
    expect(signedDoubleArea(normalizePolygon(SQUARE_12IN))).toBeGreaterThan(0)
  })

  it('preserves area and perimeter', () => {
    const noisy = [...SQUARE_12IN, pt(0, 6), pt(0, 0)]
    const normalized = normalizePolygon(noisy)
    expect(polygonArea(normalized)).toBeCloseTo(polygonArea(SQUARE_12IN), 9)
    expect(polygonPerimeter(normalized)).toBeCloseTo(polygonPerimeter(SQUARE_12IN), 9)
  })

  it('returns fewer than three points untouched rather than inventing a ring', () => {
    expect(normalizePolygon([])).toEqual([])
    expect(normalizePolygon([pt(1, 2)])).toEqual([pt(1, 2)])
    expect(normalizePolygon([pt(1, 2), pt(1, 2)])).toEqual([pt(1, 2)])
    expect(normalizePolygon([pt(0, 0), pt(12, 0)])).toHaveLength(2)
  })

  it('keeps a triangle at three points even when nearly collinear', () => {
    const sliver = [pt(0, 0), pt(12, 0.0000001), pt(24, 0)]
    expect(normalizePolygon(sliver).length).toBeGreaterThanOrEqual(3)
  })

  it('drops non-finite points', () => {
    const bad = [pt(0, 0), pt(Number.NaN, 5), pt(12, 0), pt(12, 12), pt(0, 12)]
    expect(normalizePolygon(bad)).toHaveLength(4)
  })

  it('is idempotent', () => {
    const once = normalizePolygon([...SQUARE_12IN, pt(6, 12), pt(0, 0)])
    expect(normalizePolygon(once)).toEqual(once)
  })
})

describe('isSelfIntersecting', () => {
  it('is false for a convex ring', () => {
    expect(isSelfIntersecting(SQUARE_12IN)).toBe(false)
  })

  it('is false for a concave but simple ring', () => {
    const lShape = [pt(0, 0), pt(24, 0), pt(24, 12), pt(12, 12), pt(12, 24), pt(0, 24)]
    expect(isSelfIntersecting(lShape)).toBe(false)
  })

  it('is false below four points', () => {
    expect(isSelfIntersecting([pt(0, 0), pt(12, 0), pt(0, 12)])).toBe(false)
  })
})
