import fc from 'fast-check'
import { describe, it } from 'vitest'
import { polygonBounds } from '@/lib/geometry/polygon-footprint'
import { flattenPath } from '@/modules/imports/visio/flatten'
import { outlineOf } from '@/modules/imports/visio/outline'
import { normalizeRings, scaleRings } from '@/modules/imports/visio/scale'
import { FLATTEN_TOLERANCE_IN, type RawPath } from '@/modules/imports/visio/types'

const style = { fill: true, stroke: false, fillColor: '#00ffff', strokeColor: '#000000' }
const coord = fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true })

describe('visio geometry properties', () => {
  it('every flattened arc point lies on the circle within tolerance', () => {
    fc.assert(fc.property(
      fc.record({ cx: coord, cy: coord, r: fc.double({ min: 0.05, max: 3, noNaN: true }), a0: fc.double({ min: 0, max: 6.283, noNaN: true }), sweep: fc.boolean(), large: fc.boolean() }),
      ({ cx, cy, r, a0, sweep, large }) => {
        // Radians past the start, over or under pi. SVG sweep 1 runs toward increasing angle,
        // so the generated arc runs the way its flag says it does.
        const a1 = a0 + (sweep ? 1 : -1) * (large ? 4 : 2)
        const start = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) }
        const end = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) }
        const path: RawPath = { style, segments: [
          { action: 'M', ...start },
          { action: 'A', rx: r, ry: r, rotate: 0, largeArc: large, sweep, x: end.x, y: end.y },
          { action: 'L', x: cx, y: cy }, { action: 'Z' },
        ] }
        const sub = flattenPath(path).subpaths[0]
        if (!sub) return true
        return sub.points.slice(0, -1).every(p => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) <= FLATTEN_TOLERANCE_IN + 1e-9)
      },
    ), { numRuns: 200 })
  })

  it('the union never grows past the inputs bounding box', () => {
    const square = fc.record({ x: coord, y: coord, s: fc.double({ min: 0.1, max: 2, noNaN: true }) })
    fc.assert(fc.property(fc.array(square, { minLength: 1, maxLength: 6 }), squares => {
      const subpaths = squares.map(({ x, y, s }) => ({ closed: true, points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }] }))
      const outline = outlineOf([{ style, subpaths }])
      if (!outline) return false
      const all = polygonBounds(subpaths.flatMap(s => s.points))
      const got = polygonBounds([outline.footprint, ...outline.detail].flat())
      const eps = 1e-6
      return got.minX >= all.minX - eps && got.minY >= all.minY - eps && got.maxX <= all.maxX + eps && got.maxY <= all.maxY + eps
    }), { numRuns: 200 })
  })

  it('scale then unscale is the identity', () => {
    const ring = fc.array(fc.record({ x: coord, y: coord }), { minLength: 3, maxLength: 12 })
    fc.assert(fc.property(ring, fc.double({ min: 1, max: 1200, noNaN: true }), (points, k) => {
      const n = normalizeRings([points])
      const back = scaleRings(scaleRings(n.rings, k).rings, 1 / k)
      return back.rings[0]!.every((p, i) => Math.abs(p.x - n.rings[0]![i]!.x) < 1e-6 && Math.abs(p.y - n.rings[0]![i]!.y) < 1e-6)
    }), { numRuns: 200 })
  })
})
