import { describe, expect, it } from 'vitest'

import { computeMeasurements } from '@/modules/measurements/engine'
import { ShapeKind, type PolygonPool, type RectanglePool, type Shape } from '@/modules/editor/state/shapes'

const BASE = {
  x: 0,
  y: 0,
  rotation: 0,
  zIndex: 0,
  locked: false,
  hidden: false,
} as const

// 24ft x 24ft outer box with a 12ft x 12ft bite out of one corner: an L.
const L_POINTS = [
  { x: 0, y: 0 },
  { x: 24 * 12, y: 0 },
  { x: 24 * 12, y: 12 * 12 },
  { x: 12 * 12, y: 12 * 12 },
  { x: 12 * 12, y: 24 * 12 },
  { x: 0, y: 24 * 12 },
]

function polygonPool(): PolygonPool {
  return {
    ...BASE,
    id: 'poly-1',
    kind: ShapeKind.POLYGON_POOL,
    width: 24 * 12,
    height: 24 * 12,
    points: L_POINTS,
    depthShallow: 3,
    depthDeep: 6,
  }
}

function rectanglePool(): RectanglePool {
  return {
    ...BASE,
    id: 'rect-1',
    kind: ShapeKind.RECTANGLE_POOL,
    width: 24 * 12,
    height: 24 * 12,
    depthShallow: 3,
    depthDeep: 6,
  }
}

describe('measurement engine: POLYGON_POOL', () => {
  it('measures the silhouette, not the bounding box', () => {
    const polygon = computeMeasurements([polygonPool()])
    const rectangle = computeMeasurements([rectanglePool()])

    // Identical bounding boxes.
    expect(polygon.poolLengthFt).toBeCloseTo(rectangle.poolLengthFt, 9)
    expect(polygon.poolWidthFt).toBeCloseTo(rectangle.poolWidthFt, 9)

    // Different surface area: 3/4 of the box, because a quarter is missing.
    expect(rectangle.poolSurfaceArea).toBeCloseTo(576, 6)
    expect(polygon.poolSurfaceArea).toBeCloseTo(432, 6)
    expect(polygon.poolSurfaceArea).not.toBeCloseTo(rectangle.poolSurfaceArea, 3)
  })

  it('perimeter follows the ring, and coping follows the perimeter', () => {
    const summary = computeMeasurements([polygonPool()])
    // 24 + 24 + 12 + 12 + 12 + 12 = 96 lf.
    expect(summary.poolPerimeter).toBeCloseTo(96, 6)
    expect(summary.copingLinearFeet).toBeCloseTo(96, 6)
  })

  it('derives gallons, wetted area, and depths like any other pool', () => {
    const summary = computeMeasurements([polygonPool()])
    expect(summary.hasPool).toBe(true)
    expect(summary.poolDepthShallow).toBe(3)
    expect(summary.poolDepthDeep).toBe(6)
    expect(summary.poolAvgDepth).toBeCloseTo(4.5, 9)
    expect(summary.poolGallons).toBeCloseTo(432 * 4.5 * 7.48052, 4)
    expect(summary.poolWettedArea).toBeCloseTo(432 + 96 * 4.5, 6)
  })

  it('contributes nothing when hidden', () => {
    const hidden: Shape = { ...polygonPool(), hidden: true }
    expect(computeMeasurements([hidden]).hasPool).toBe(false)
  })

  it('a degenerate ring measures zero rather than throwing', () => {
    const degenerate: PolygonPool = { ...polygonPool(), points: [{ x: 0, y: 0 }] }
    const summary = computeMeasurements([degenerate])
    expect(summary.poolSurfaceArea).toBe(0)
    expect(summary.poolPerimeter).toBe(0)
    expect(summary.hasPool).toBe(true)
  })

  it('sums alongside a rectangle pool', () => {
    const summary = computeMeasurements([polygonPool(), rectanglePool()])
    expect(summary.poolSurfaceArea).toBeCloseTo(432 + 576, 6)
  })
})
