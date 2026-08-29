import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  DEFAULT_GRID,
  GRID_SPACINGS,
  closeRing,
  dedupe,
  gridInches,
  isClosed,
  orthoConstrain,
  sampleArc,
  sampleQuadratic,
  simplify,
  snapPath,
  snapPoint,
  snapValue,
  tidyFreehand,
  type Point,
} from '@/lib/geometry/drawing'

const point = fc.record({
  x: fc.double({ min: -5000, max: 5000, noNaN: true }),
  y: fc.double({ min: -5000, max: 5000, noNaN: true }),
})

describe('grid', () => {
  it('offers only spacings a tape measure has', () => {
    expect(GRID_SPACINGS.map(s => s.inches)).toEqual([3, 6, 12, 24, 60])
  })

  it('defaults to one foot', () => {
    expect(gridInches(DEFAULT_GRID)).toBe(12)
  })

  it('falls back to a foot for an unknown id rather than snapping to nothing', () => {
    expect(gridInches('nonsense' as never)).toBe(12)
  })
})

describe('snapValue', () => {
  it('rounds to the nearest multiple', () => {
    expect(snapValue(13, 12)).toBe(12)
    expect(snapValue(19, 12)).toBe(24)
    expect(snapValue(-13, 12)).toBe(-12)
  })

  it('leaves the value alone when snapping is off', () => {
    expect(snapValue(13.7, 0)).toBe(13.7)
    expect(snapValue(13.7, -5)).toBe(13.7)
  })

  it('never moves a point further than half a cell', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10000, max: 10000, noNaN: true }),
        fc.constantFrom(3, 6, 12, 24, 60),
        (value, spacing) => {
          expect(Math.abs(snapValue(value, spacing) - value)).toBeLessThanOrEqual(spacing / 2 + 1e-9)
        },
      ),
    )
  })

  it('is idempotent: snapping a snapped value changes nothing', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10000, max: 10000, noNaN: true }),
        fc.constantFrom(3, 6, 12, 24, 60),
        (value, spacing) => {
          const once = snapValue(value, spacing)
          expect(snapValue(once, spacing)).toBeCloseTo(once, 9)
        },
      ),
    )
  })

  it('lands every snapped point on the grid', () => {
    fc.assert(
      fc.property(point, fc.constantFrom(3, 6, 12, 24, 60), (p, spacing) => {
        const snapped = snapPoint(p, spacing)
        expect(Math.abs(snapped.x % spacing)).toBeLessThan(1e-6)
        expect(Math.abs(snapped.y % spacing)).toBeLessThan(1e-6)
      }),
    )
  })

  it('snaps a whole path', () => {
    expect(snapPath([{ x: 13, y: 19 }], 12)).toEqual([{ x: 12, y: 24 }])
  })
})

describe('orthoConstrain', () => {
  it('flattens a nearly horizontal segment to exactly horizontal', () => {
    expect(orthoConstrain({ x: 0, y: 0 }, { x: 100, y: 3 })).toEqual({ x: 100, y: 0 })
  })

  it('straightens a nearly vertical segment', () => {
    expect(orthoConstrain({ x: 0, y: 0 }, { x: 3, y: 100 })).toEqual({ x: 0, y: 100 })
  })

  it('keeps a genuine diagonal diagonal, with equal run and rise', () => {
    const result = orthoConstrain({ x: 0, y: 0 }, { x: 100, y: 90 })
    expect(Math.abs(result.x)).toBeCloseTo(Math.abs(result.y), 6)
  })

  it('always returns a point on one of the three allowed axes', () => {
    fc.assert(
      fc.property(point, point, (from, to) => {
        const result = orthoConstrain(from, to)
        const dx = Math.abs(result.x - from.x)
        const dy = Math.abs(result.y - from.y)
        const horizontal = dy < 1e-6
        const vertical = dx < 1e-6
        const diagonal = Math.abs(dx - dy) < 1e-6
        expect(horizontal || vertical || diagonal).toBe(true)
      }),
    )
  })
})

describe('simplify', () => {
  it('reduces a straight run to its two ends', () => {
    const line: Point[] = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }))
    expect(simplify(line, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 49, y: 0 }])
  })

  it('keeps a corner', () => {
    const corner: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(simplify(corner, 0.5)).toHaveLength(3)
  })

  it('keeps both ends whatever the tolerance', () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 2, maxLength: 40 }), fc.double({ min: 0.1, max: 500, noNaN: true }), (points, tolerance) => {
        const result = simplify(points, tolerance)
        expect(result[0]).toEqual(points[0])
        expect(result[result.length - 1]).toEqual(points[points.length - 1])
      }),
    )
  })

  it('never returns more points than it was given', () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 2, maxLength: 60 }), fc.double({ min: 0.1, max: 500, noNaN: true }), (points, tolerance) => {
        expect(simplify(points, tolerance).length).toBeLessThanOrEqual(points.length)
      }),
    )
  })
})

describe('isClosed and closeRing', () => {
  it('treats ends within tolerance as closed', () => {
    expect(isClosed([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }], 3)).toBe(true)
  })

  it('refuses to close two points, which is a line and not a shape', () => {
    expect(isClosed([{ x: 0, y: 0 }, { x: 0, y: 0 }], 3)).toBe(false)
  })

  it('drops the duplicated end vertex when closing', () => {
    const ring = closeRing([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }], 1)
    expect(ring).toHaveLength(3)
  })

  it('leaves an open path alone', () => {
    const open: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 40, y: 90 }]
    expect(closeRing(open, 1)).toEqual(open)
  })
})

describe('dedupe', () => {
  it('collapses consecutive duplicates', () => {
    expect(dedupe([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 12, y: 0 }])).toHaveLength(2)
  })

  it('keeps a point that repeats later but not consecutively', () => {
    expect(dedupe([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 0, y: 0 }])).toHaveLength(3)
  })
})

describe('curves', () => {
  it('samples a quadratic from end to end', () => {
    const curve = sampleQuadratic({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }, 8)
    expect(curve).toHaveLength(9)
    expect(curve[0]).toEqual({ x: 0, y: 0 })
    expect(curve[curve.length - 1]).toEqual({ x: 10, y: 0 })
  })

  it('bulges toward the control point rather than running straight', () => {
    const curve = sampleQuadratic({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }, 8)
    const middle = curve[4]
    expect(middle && middle.y).toBeGreaterThan(0)
  })

  it('draws an arc that passes near the point it was told to pass through', () => {
    const arc = sampleArc({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }, 32)
    const nearest = Math.min(...arc.map(p => Math.hypot(p.x - 5, p.y - 5)))
    expect(nearest).toBeLessThan(0.5)
  })

  // Three points in a line have no circle through them. The honest answer is
  // the straight line, not a divide by zero that yields NaN vertices.
  it('degrades a collinear arc to a straight segment', () => {
    expect(sampleArc({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
  })

  it('never emits a non-finite vertex', () => {
    fc.assert(
      fc.property(point, point, point, (a, b, c) => {
        for (const p of sampleArc(a, b, c, 8)) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        }
      }),
    )
  })
})

describe('tidyFreehand', () => {
  it('turns a noisy straight drag into two points on the grid', () => {
    const noisy: Point[] = Array.from({ length: 60 }, (_, i) => ({ x: i * 2, y: Math.sin(i) * 0.4 }))
    const tidy = tidyFreehand(noisy, { tolerance: 2, spacing: 12 })
    expect(tidy.length).toBeLessThanOrEqual(3)
    for (const p of tidy) expect(p.x % 12).toBe(0)
  })

  it('leaves no consecutive duplicates for the polygon code to trip on', () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 2, maxLength: 50 }), (points) => {
        const tidy = tidyFreehand(points, { tolerance: 6, spacing: 12 })
        for (let i = 1; i < tidy.length; i += 1) {
          const a = tidy[i - 1]
          const b = tidy[i]
          expect(a && b && a.x === b.x && a.y === b.y).toBe(false)
        }
      }),
    )
  })
})
