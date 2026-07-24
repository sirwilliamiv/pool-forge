import { describe, it, expect } from 'vitest'
import {
  polygonAreaSqft,
  polygonPerimeterLf,
  polygonBoundingBox,
  type Point,
} from '@/lib/geometry/polygon'
import { ellipseAreaSqft, ellipsePerimeterLf } from '@/lib/geometry/ellipse'
import { rectangleAreaSqft, rectanglePerimeterLf } from '@/lib/geometry/rectangle'

describe('polygon geometry', () => {
  it('area of a 12x12 in square = 1 sqft, perimeter = 4 lf', () => {
    const square: Point[] = [
      [0, 0],
      [12, 0],
      [12, 12],
      [0, 12],
    ]
    expect(polygonAreaSqft(square)).toBeCloseTo(1, 6)
    expect(polygonPerimeterLf(square)).toBeCloseTo(4, 6)
  })

  it('matches the rectangle helpers for a rectangular polygon', () => {
    const w = 25 * 12
    const h = 12 * 12
    const rect: Point[] = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]
    expect(polygonAreaSqft(rect)).toBeCloseTo(rectangleAreaSqft(w, h), 6)
    expect(polygonPerimeterLf(rect)).toBeCloseTo(rectanglePerimeterLf(w, h), 6)
  })

  it('winding order does not affect absolute area', () => {
    const cw: Point[] = [
      [0, 0],
      [0, 12],
      [12, 12],
      [12, 0],
    ]
    expect(polygonAreaSqft(cw)).toBeCloseTo(1, 6)
  })

  it('degenerate polygons are zero', () => {
    expect(polygonAreaSqft([[0, 0]])).toBe(0)
    expect(polygonPerimeterLf([])).toBe(0)
  })

  it('bounding box spans the extents', () => {
    const bb = polygonBoundingBox([
      [10, 20],
      [40, 20],
      [40, 60],
      [10, 60],
    ])
    expect(bb).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })
})

describe('ellipse geometry', () => {
  it('a circle of 2 ft diameter has area pi sqft and perimeter 2*pi lf', () => {
    const d = 24 // 2 ft in inches
    expect(ellipseAreaSqft(d, d)).toBeCloseTo(Math.PI, 5)
    expect(ellipsePerimeterLf(d, d)).toBeCloseTo(2 * Math.PI, 5)
  })

  it('area = pi * a * b for an oval', () => {
    // 30 ft x 15 ft oval -> a=15ft, b=7.5ft -> pi*15*7.5 sqft
    expect(ellipseAreaSqft(30 * 12, 15 * 12)).toBeCloseTo(Math.PI * 15 * 7.5, 4)
  })

  it('an ellipse holds less area than its bounding rectangle', () => {
    const w = 30 * 12
    const h = 15 * 12
    expect(ellipseAreaSqft(w, h)).toBeLessThan(rectangleAreaSqft(w, h))
  })
})
