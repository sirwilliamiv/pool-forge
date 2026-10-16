import { describe, expect, it } from 'vitest'
import { flattenPath } from '@/modules/imports/visio/flatten'
import { FLATTEN_TOLERANCE_IN, type RawPath } from '@/modules/imports/visio/types'

const style = { fill: true, stroke: false, fillColor: '#00ffff', strokeColor: null }

describe('flattenPath', () => {
  it('leaves a polygon alone and marks it closed', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 }, { action: 'L', x: 2, y: 0 }, { action: 'L', x: 2, y: 1 }, { action: 'L', x: 0, y: 1 }, { action: 'L', x: 0, y: 0 }, { action: 'Z' },
    ] }
    const [sub] = flattenPath(path).subpaths
    // The closing point that repeats the start is dropped: rings store each vertex once.
    expect(sub?.points).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }])
    expect(sub?.closed).toBe(true)
  })

  it('flattens a full circle of two half arcs within tolerance', () => {
    // Round Corners' corner disc: centre (0.25, 1.75), r 0.25. The file omits sweep, which means 1.
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0.5, y: 1.75 },
      { action: 'A', rx: 0.25, ry: 0.25, rotate: 180, largeArc: true, sweep: true, x: 0.25, y: 1.5 },
      { action: 'A', rx: 0.25, ry: 0.25, rotate: 180, largeArc: false, sweep: true, x: 0.5, y: 1.75 },
      { action: 'Z' },
    ] }
    const [sub] = flattenPath(path).subpaths
    expect(sub?.closed).toBe(true)
    expect(sub!.points.length).toBeGreaterThan(12)
    for (const p of sub!.points) {
      const r = Math.hypot(p.x - 0.25, p.y - 1.75)
      expect(Math.abs(r - 0.25)).toBeLessThanOrEqual(FLATTEN_TOLERANCE_IN)
    }
  })

  it('flattens quadratic and cubic curves through their control hull', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 },
      { action: 'Q', x1: 0.5, y1: 1, x: 1, y: 0 },
      { action: 'C', x1: 1.5, y1: -1, x2: 2.5, y2: -1, x: 3, y: 0 },
    ] }
    const [sub] = flattenPath(path).subpaths
    expect(sub?.closed).toBe(false)
    const ys = sub!.points.map(p => p.y)
    expect(Math.max(...ys)).toBeCloseTo(0.5, 2)   // quadratic peak at t=0.5 is y=0.5
    expect(Math.min(...ys)).toBeCloseTo(-0.75, 2) // cubic trough at t=0.5 is y=-0.75
  })

  it('starts a new subpath at a second M and drops degenerate ones', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 }, { action: 'L', x: 1, y: 0 },           // a line: two points, dropped
      { action: 'M', x: 0, y: 2 }, { action: 'L', x: 1, y: 2 }, { action: 'L', x: 1, y: 3 }, { action: 'Z' },
    ] }
    const subs = flattenPath(path).subpaths
    expect(subs).toHaveLength(1)
    expect(subs[0]?.closed).toBe(true)
  })

  it('treats a path whose last point equals its first as closed even without Z', () => {
    const path: RawPath = { style, segments: [
      { action: 'M', x: 0, y: 0 }, { action: 'L', x: 1, y: 0 }, { action: 'L', x: 1, y: 1 }, { action: 'L', x: 0, y: 0 },
    ] }
    expect(flattenPath(path).subpaths[0]?.closed).toBe(true)
  })
})
