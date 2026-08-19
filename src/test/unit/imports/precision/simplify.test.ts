import { describe, it, expect } from 'vitest'
import type { Point } from '@/modules/imports/intent'
import {
  boundsOf,
  closeRing,
  dedupePoints,
  douglasPeucker,
  perpendicularDistance,
  resamplePolygon,
  simplifyRing,
  snapToAxis,
  snapToGrid,
} from '@/modules/imports/precision/simplify'
import { polygonAreaSqft, polygonPerimeterLf, type Point as Tuple } from '@/lib/geometry/polygon'

function tuples(points: readonly Point[]): Tuple[] {
  return points.map((p) => [p.x, p.y] as Tuple)
}

function edgeAngles(ring: readonly Point[]): number[] {
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  })
}

describe('perpendicularDistance', () => {
  it('measures to the infinite line, not the segment', () => {
    const a: Point = { x: 0, y: 0 }
    const b: Point = { x: 10, y: 0 }
    expect(perpendicularDistance({ x: 5, y: 3 }, a, b)).toBeCloseTo(3, 10)
    expect(perpendicularDistance({ x: 50, y: 4 }, a, b)).toBeCloseTo(4, 10)
  })

  it('falls back to point distance for a zero-length segment', () => {
    const a: Point = { x: 2, y: 2 }
    expect(perpendicularDistance({ x: 5, y: 6 }, a, a)).toBeCloseTo(5, 10)
  })
})

describe('douglasPeucker', () => {
  it('reduces a noisy near-straight line to its endpoints', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0.4 },
      { x: 20, y: -0.3 },
      { x: 30, y: 0.2 },
      { x: 40, y: 0 },
    ]
    expect(douglasPeucker(points, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ])
  })

  it('keeps a corner that exceeds epsilon', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ]
    expect(douglasPeucker(points, 1)).toEqual(points)
    expect(douglasPeucker(points, 6)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
  })

  it('drops every interior point of a collinear run', () => {
    const points: Point[] = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 2 * i }))
    expect(douglasPeucker(points, 0.001)).toEqual([
      { x: 0, y: 0 },
      { x: 49, y: 98 },
    ])
  })

  it('handles 0, 1 and 2 point inputs', () => {
    expect(douglasPeucker([], 1)).toEqual([])
    expect(douglasPeucker([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }])
    const two: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]
    expect(douglasPeucker(two, 1)).toEqual(two)
  })

  it('returns the input unchanged for a non-positive epsilon', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0.001 },
      { x: 2, y: 0 },
    ]
    expect(douglasPeucker(points, 0)).toEqual(points)
    expect(douglasPeucker(points, -5)).toEqual(points)
  })

  it('copies rather than aliasing the input', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    const out = douglasPeucker(points, 1)
    out[0]!.x = 99
    expect(points[0]!.x).toBe(0)
  })

  it('survives a pathological input that would blow a recursive stack', () => {
    // A staircase splits off roughly one point per level, so the split depth
    // tracks the input length: at 15000 points a recursive implementation is
    // well past the frame budget, while the iterative one just works.
    const points: Point[] = []
    for (let i = 0; i < 15000; i++) points.push({ x: i, y: i % 2 })
    expect(() => douglasPeucker(points, 0.1)).not.toThrow()
    expect(douglasPeucker(points, 0.1).length).toBeGreaterThan(2)
  })

  it('never introduces a point that was not in the input', () => {
    const points: Point[] = Array.from({ length: 200 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 9) * 30,
    }))
    const simplified = douglasPeucker(points, 3)
    for (const p of simplified) {
      expect(points.some((q) => q.x === p.x && q.y === p.y)).toBe(true)
    }
  })
})

describe('dedupePoints and closeRing', () => {
  it('drops consecutive duplicates and non-finite points', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 1, y: 0 },
      { x: 1, y: Number.POSITIVE_INFINITY },
      { x: 1, y: 1 },
    ]
    expect(dedupePoints(points)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ])
  })

  it('removes a trailing repeat of the first point', () => {
    const closed: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
    ]
    expect(closeRing(closed)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
  })

  it('leaves an already open ring alone', () => {
    const open: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    expect(closeRing(open)).toEqual(open)
  })
})

describe('simplifyRing', () => {
  it('does not depend on where the trace happened to start', () => {
    const base: Point[] = []
    for (let i = 0; i < 120; i++) {
      const t = (i / 120) * Math.PI * 2
      base.push({ x: 200 + 100 * Math.cos(t), y: 150 + 60 * Math.sin(t) })
    }
    const rotated = base.slice(37).concat(base.slice(0, 37))
    expect(simplifyRing(rotated, 2)).toEqual(simplifyRing(base, 2))
  })

  it('reduces a jittered rectangle back to four corners', () => {
    const ring: Point[] = []
    const push = (x: number, y: number) => ring.push({ x, y })
    for (let i = 0; i <= 40; i++) push(i * 5, (i % 3) * 0.4)
    for (let i = 1; i <= 20; i++) push(200 + (i % 3) * 0.4, i * 5)
    for (let i = 1; i <= 40; i++) push(200 - i * 5, 100 + (i % 3) * 0.4)
    for (let i = 1; i < 20; i++) push((i % 3) * 0.4, 100 - i * 5)
    const simplified = simplifyRing(ring, 3)
    expect(simplified.length).toBe(4)
  })

  it('leaves a triangle alone', () => {
    const triangle: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ]
    expect(simplifyRing(triangle, 5)).toEqual(triangle)
  })
})

describe('snapToAxis', () => {
  it('makes a slightly rotated rectangle exactly axis aligned and still closed', () => {
    const ring: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 3 },
      { x: 197, y: 103 },
      { x: -3, y: 100 },
    ]
    const snapped = snapToAxis(ring, 3)
    expect(snapped).toHaveLength(4)
    for (const angle of edgeAngles(snapped)) {
      const normalized = Math.abs(((angle % 90) + 90) % 90)
      expect(Math.min(normalized, 90 - normalized)).toBeLessThan(1e-9)
    }
  })

  it('does not drift: the closing edge matches the opening one exactly', () => {
    // The naive edge-by-edge rewrite leaves a gap here, because each edge
    // overwrites a coordinate the previous edge had just set.
    const ring: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 1 },
      { x: 101, y: 60 },
      { x: 220, y: 61 },
      { x: 221, y: 140 },
      { x: 1, y: 139 },
    ]
    const snapped = snapToAxis(ring, 3)
    const first = snapped[0]!
    const last = snapped[snapped.length - 1]!
    // Last edge runs from `last` back to `first` and was near-vertical.
    expect(Math.abs(last.x - first.x)).toBeLessThan(1e-9)
  })

  it('gives every vertex in a shared run the same coordinate', () => {
    const ring: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0.5 },
      { x: 100, y: -0.5 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ]
    const snapped = snapToAxis(ring, 3)
    expect(snapped[0]!.y).toBeCloseTo(snapped[1]!.y, 12)
    expect(snapped[1]!.y).toBeCloseTo(snapped[2]!.y, 12)
    expect(snapped[0]!.y).toBeCloseTo(0, 12)
  })

  it('leaves a genuine diagonal alone', () => {
    const ring: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 60, y: 60 },
    ]
    const snapped = snapToAxis(ring, 3)
    expect(snapped[2]).toEqual({ x: 60, y: 60 })
  })

  it('is a no-op for degenerate inputs', () => {
    expect(snapToAxis([], 3)).toEqual([])
    expect(snapToAxis([{ x: 1, y: 2 }], 3)).toEqual([{ x: 1, y: 2 }])
    const two: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0.1 },
    ]
    expect(snapToAxis(two, 0)).toEqual(two)
  })

  it('preserves area to within the tolerance it was given', () => {
    const ring: Point[] = [
      { x: 0, y: 0 },
      { x: 240, y: 4 },
      { x: 236, y: 124 },
      { x: -4, y: 120 },
    ]
    const before = polygonAreaSqft(tuples(ring))
    const after = polygonAreaSqft(tuples(snapToAxis(ring, 3)))
    expect(Math.abs(after - before) / before).toBeLessThan(0.02)
  })
})

describe('snapToGrid', () => {
  const origin: Point = { x: 3, y: 7 }

  it('pulls a near-intersection vertex exactly onto it', () => {
    const snapped = snapToGrid([{ x: 22.4, y: 26.6 }], 20, origin, 5)
    expect(snapped[0]).toEqual({ x: 23, y: 27 })
  })

  it('leaves a vertex that is not near any line where it is', () => {
    const snapped = snapToGrid([{ x: 13, y: 17 }], 20, origin, 3)
    expect(snapped[0]).toEqual({ x: 13, y: 17 })
  })

  it('snaps each axis on its own merit', () => {
    // Near a vertical rule in x, nowhere near a horizontal one in y.
    const snapped = snapToGrid([{ x: 42.5, y: 17 }], 20, origin, 3)
    expect(snapped[0]!.x).toBeCloseTo(43, 10)
    expect(snapped[0]!.y).toBe(17)
  })

  it('is a no-op for a non-positive pitch or tolerance', () => {
    const points: Point[] = [{ x: 1.2, y: 3.4 }]
    expect(snapToGrid(points, 0, origin, 5)).toEqual(points)
    expect(snapToGrid(points, 20, origin, 0)).toEqual(points)
    expect(snapToGrid(points, 20, { x: Number.NaN, y: 0 }, 5)).toEqual(points)
  })

  it('does not alias the input', () => {
    const points: Point[] = [{ x: 22.4, y: 26.6 }]
    snapToGrid(points, 20, origin, 5)
    expect(points[0]).toEqual({ x: 22.4, y: 26.6 })
  })
})

describe('resamplePolygon', () => {
  it('caps the vertex count at the requested maximum', () => {
    const circle: Point[] = Array.from({ length: 300 }, (_, i) => {
      const t = (i / 300) * Math.PI * 2
      return { x: 500 + 200 * Math.cos(t), y: 500 + 200 * Math.sin(t) }
    })
    const capped = resamplePolygon(circle, 32)
    expect(capped).toHaveLength(32)
  })

  it('preserves area to within a percent when capping a smooth outline', () => {
    const circle: Point[] = Array.from({ length: 300 }, (_, i) => {
      const t = (i / 300) * Math.PI * 2
      return { x: 500 + 200 * Math.cos(t), y: 500 + 120 * Math.sin(t) }
    })
    const before = polygonAreaSqft(tuples(circle))
    const after = polygonAreaSqft(tuples(resamplePolygon(circle, 48)))
    expect(Math.abs(after - before) / before).toBeLessThan(0.01)
  })

  it('keeps the corners of a rectangle with dense edges', () => {
    const ring: Point[] = []
    for (let i = 0; i < 50; i++) ring.push({ x: i * 4, y: 0 })
    for (let i = 0; i < 50; i++) ring.push({ x: 200, y: i * 2 })
    for (let i = 0; i < 50; i++) ring.push({ x: 200 - i * 4, y: 100 })
    for (let i = 0; i < 50; i++) ring.push({ x: 0, y: 100 - i * 2 })
    const capped = resamplePolygon(ring, 4)
    const bounds = boundsOf(capped)
    expect(bounds.width).toBeCloseTo(200, 6)
    expect(bounds.height).toBeCloseTo(100, 6)
  })

  it('never goes below three points, whatever it is asked for', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(resamplePolygon(square, 0)).toHaveLength(3)
    expect(resamplePolygon(square, -4)).toHaveLength(3)
  })

  it('passes short inputs through, closing them first', () => {
    expect(resamplePolygon([], 10)).toEqual([])
    expect(resamplePolygon([{ x: 1, y: 1 }], 10)).toEqual([{ x: 1, y: 1 }])
    const closed: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 0 },
    ]
    expect(resamplePolygon(closed, 10)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ])
  })
})

describe('degenerate polygons the model can and will produce', () => {
  it('handles an all-collinear ring without throwing', () => {
    const ring: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]
    expect(() => simplifyRing(ring, 1)).not.toThrow()
    expect(polygonAreaSqft(tuples(simplifyRing(ring, 1)))).toBeCloseTo(0, 10)
  })

  it('handles a ring of repeated points', () => {
    const ring: Point[] = Array.from({ length: 20 }, () => ({ x: 4, y: 9 }))
    expect(closeRing(ring)).toEqual([{ x: 4, y: 9 }])
    expect(simplifyRing(ring, 2)).toEqual([{ x: 4, y: 9 }])
  })

  it('does not throw on a self-intersecting bowtie', () => {
    const bowtie: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]
    expect(() => simplifyRing(bowtie, 2)).not.toThrow()
    expect(() => snapToAxis(bowtie, 3)).not.toThrow()
    expect(() => resamplePolygon(bowtie, 3)).not.toThrow()
    // The shoelace cancels a bowtie against itself; that is the honest answer,
    // and it is why the caller has to reject self-intersection before pricing.
    expect(polygonAreaSqft(tuples(bowtie))).toBeCloseTo(0, 6)
  })

  it('treats a first-equals-last ring the same as an open one', () => {
    const open: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]
    const closed = [...open, { x: 0, y: 0 }]
    expect(simplifyRing(closed, 1)).toEqual(simplifyRing(open, 1))
    expect(resamplePolygon(closed, 8)).toEqual(resamplePolygon(open, 8))
  })
})

describe('round trip: simplifying must not move the measurement', () => {
  const outlines: { name: string; points: Point[] }[] = [
    {
      name: 'kidney',
      points: Array.from({ length: 400 }, (_, i) => {
        const t = (i / 400) * Math.PI * 2
        const r = 240 + 55 * Math.cos(2 * t) + 18 * Math.sin(3 * t)
        return { x: 600 + r * Math.cos(t), y: 500 + r * 0.62 * Math.sin(t) }
      }),
    },
    {
      name: 'lagoon',
      points: Array.from({ length: 500 }, (_, i) => {
        const t = (i / 500) * Math.PI * 2
        const r = 300 + 40 * Math.sin(5 * t) + 25 * Math.cos(3 * t)
        return { x: 700 + r * Math.cos(t), y: 700 + r * Math.sin(t) }
      }),
    },
  ]

  for (const outline of outlines) {
    it(`${outline.name}: area and perimeter survive the full cleanup`, () => {
      const areaBefore = polygonAreaSqft(tuples(outline.points))
      const perimeterBefore = polygonPerimeterLf(tuples(outline.points))

      const simplified = simplifyRing(outline.points, 3)
      const snapped = snapToAxis(simplified, 3)
      const capped = resamplePolygon(snapped, 48)

      const areaAfter = polygonAreaSqft(tuples(capped))
      const perimeterAfter = polygonPerimeterLf(tuples(capped))

      // Cleanup inscribes the outline, so area drifts slightly low while the
      // perimeter barely moves. Both stay far inside the 5% band the spec puts
      // on an extracted dimension.
      expect(Math.abs(areaAfter - areaBefore) / areaBefore).toBeLessThan(0.02)
      expect(Math.abs(perimeterAfter - perimeterBefore) / perimeterBefore).toBeLessThan(0.01)
      expect(capped.length).toBeLessThanOrEqual(48)
    })
  }

  it('tightening epsilon never increases the measurement error', () => {
    const points = outlines[0]!.points
    const truth = polygonAreaSqft(tuples(points))
    const coarse = Math.abs(polygonAreaSqft(tuples(simplifyRing(points, 12))) - truth)
    const fine = Math.abs(polygonAreaSqft(tuples(simplifyRing(points, 1))) - truth)
    expect(fine).toBeLessThanOrEqual(coarse + 1e-9)
  })
})

describe('boundsOf', () => {
  it('returns a zero box for no points', () => {
    expect(boundsOf([])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    })
  })

  it('spans every point', () => {
    const bounds = boundsOf([
      { x: -5, y: 2 },
      { x: 30, y: -8 },
      { x: 12, y: 40 },
    ])
    expect(bounds).toEqual({ minX: -5, minY: -8, maxX: 30, maxY: 40, width: 35, height: 48 })
  })
})
