import { describe, it, expect } from 'vitest'
import type { Point } from '@/modules/imports/intent'
import { detectGrid, type GridDetection } from '@/modules/imports/precision/grid'
import { defaultEpsilonPx, runPrecisionPipeline } from '@/modules/imports/precision/pipeline'
import type { LabeledDimension } from '@/modules/imports/precision/scale'
import { boundsOf } from '@/modules/imports/precision/simplify'
import { polygonAreaSqft, type Point as Tuple } from '@/lib/geometry/polygon'
import { makeGridImage } from './synthetic'

function tuples(points: readonly Point[]): Tuple[] {
  return points.map((p) => [p.x, p.y] as Tuple)
}

const NO_INPUT = {
  grid: null,
  gridSquareRealInches: null,
  labeledDimensions: [] as LabeledDimension[],
  scaleBar: null,
  manual: null,
  options: {},
}

/** A hand-traced rectangle: jittered edges, far too many points, slightly skewed. */
function coarseTrace(
  x: number,
  y: number,
  width: number,
  height: number,
  jitter = 1.2,
): Point[] {
  const points: Point[] = []
  const step = 4
  let phase = 0
  const wobble = () => {
    phase += 1
    return (((phase * 7919) % 13) / 13 - 0.5) * 2 * jitter
  }
  for (let i = 0; i < width; i += step) points.push({ x: x + i, y: y + wobble() })
  for (let i = 0; i < height; i += step) points.push({ x: x + width + wobble(), y: y + i })
  for (let i = width; i > 0; i -= step) points.push({ x: x + i, y: y + height + wobble() })
  for (let i = height; i > 0; i -= step) points.push({ x: x + wobble(), y: y + i })
  return points
}

describe('defaultEpsilonPx', () => {
  it('is a fraction of the grid pitch when a grid was found', () => {
    const grid: GridDetection = { pitchPx: 40, confidence: 0.9, originOffsetPx: { x: 0, y: 0 } }
    expect(defaultEpsilonPx([], grid)).toBeCloseTo(6, 10)
  })

  it('scales with the polygon when there is no grid', () => {
    const small = defaultEpsilonPx(coarseTrace(0, 0, 200, 100), null)
    const large = defaultEpsilonPx(coarseTrace(0, 0, 2000, 1000), null)
    expect(large).toBeGreaterThan(small)
  })

  it('never goes below half a pixel', () => {
    expect(defaultEpsilonPx([{ x: 0, y: 0 }], null)).toBe(0.5)
  })
})

describe('runPrecisionPipeline geometry', () => {
  it('cleans a jittery 400-point trace down to four corners', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: coarseTrace(120, 80, 400, 240),
    })
    expect(result.steps.inputPoints).toBeGreaterThan(200)
    expect(result.polygonPx.length).toBeGreaterThanOrEqual(4)
    expect(result.polygonPx.length).toBeLessThanOrEqual(6)
    // The trace jitters by up to 1.2px, so the recovered box may not be exact.
    const bounds = boundsOf(result.polygonPx)
    expect(Math.abs(bounds.width - 400)).toBeLessThan(2.5)
    expect(Math.abs(bounds.height - 240)).toBeLessThan(2.5)
    const area = polygonAreaSqft(tuples(result.polygonPx))
    expect(Math.abs(area - (400 * 240) / 144) / ((400 * 240) / 144)).toBeLessThan(0.02)
  })

  it('honours an explicit vertex cap', () => {
    const blob: Point[] = Array.from({ length: 400 }, (_, i) => {
      const t = (i / 400) * Math.PI * 2
      const r = 300 + 60 * Math.sin(5 * t)
      return { x: 700 + r * Math.cos(t), y: 700 + r * Math.sin(t) }
    })
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: blob,
      options: { simplifyEpsilonPx: 1, maxPoints: 20 },
    })
    expect(result.polygonPx.length).toBeLessThanOrEqual(20)
  })

  it('reports each stage so the review UI can explain what it did', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: coarseTrace(0, 0, 400, 240),
    })
    expect(result.steps.afterSimplify).toBeLessThan(result.steps.inputPoints)
    expect(result.steps.afterAxisSnap).toBe(result.steps.afterSimplify)
    expect(result.steps.gridSnapped).toBe(false)
    expect(result.steps.simplifyEpsilonPx).toBeGreaterThan(0)
  })

  it('snaps onto a grid when one was detected', () => {
    const grid: GridDetection = { pitchPx: 20, confidence: 0.9, originOffsetPx: { x: 0, y: 0 } }
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      grid,
      gridSquareRealInches: 12,
      polygonPx: coarseTrace(100.5, 60.5, 400, 240, 1),
    })
    expect(result.steps.gridSnapped).toBe(true)
    for (const p of result.polygonPx) {
      expect(Math.abs(p.x % 20)).toBeLessThan(1e-6)
      expect(Math.abs(p.y % 20)).toBeLessThan(1e-6)
    }
  })

  it('leaves a vertex alone when it is too far from the grid to be a rounding error', () => {
    const grid: GridDetection = { pitchPx: 20, confidence: 0.9, originOffsetPx: { x: 0, y: 0 } }
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      grid,
      gridSquareRealInches: 12,
      // A triangle with one vertex squarely between grid lines.
      polygonPx: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 110, y: 190 },
      ],
      options: { simplifyEpsilonPx: 0.5, axisToleranceDeg: 3 },
    })
    const odd = result.polygonPx.find((p) => Math.abs(p.x - 110) < 6)
    expect(odd?.x).toBe(110)
  })

  it('preserves the measured area through the whole pass', () => {
    const outline: Point[] = Array.from({ length: 360 }, (_, i) => {
      const t = (i / 360) * Math.PI * 2
      const r = 260 + 40 * Math.cos(2 * t)
      return { x: 600 + r * Math.cos(t), y: 520 + r * 0.7 * Math.sin(t) }
    })
    const before = polygonAreaSqft(tuples(outline))
    const result = runPrecisionPipeline({ ...NO_INPUT, polygonPx: outline })
    const after = polygonAreaSqft(tuples(result.polygonPx))
    expect(Math.abs(after - before) / before).toBeLessThan(0.02)
  })
})

describe('runPrecisionPipeline scale', () => {
  it('converts to inches once a scale resolves, and not before', () => {
    const trace = coarseTrace(0, 0, 480, 240)

    const unscaled = runPrecisionPipeline({ ...NO_INPUT, polygonPx: trace })
    expect(unscaled.scale.pixelsPerInch).toBeNull()
    expect(unscaled.polygonInches).toBeNull()
    expect(unscaled.warnings.join(' ')).toContain('no usable scale')

    const scaled = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: trace,
      manual: { pxDistance: 240, realInches: 120 },
    })
    expect(scaled.scale.pixelsPerInch).toBeCloseTo(2, 10)
    expect(scaled.polygonInches).not.toBeNull()
    const bounds = boundsOf(scaled.polygonInches!)
    expect(bounds.width).toBeCloseTo(240, 0)
  })

  it('uses the grid pitch over every other source', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: coarseTrace(0, 0, 400, 200),
      grid: { pitchPx: 24, confidence: 0.95, originOffsetPx: { x: 0, y: 0 } },
      gridSquareRealInches: 12,
      labeledDimensions: [{ p1: { x: 0, y: 0 }, p2: { x: 400, y: 0 }, realInches: 100 }],
      manual: { pxDistance: 1000, realInches: 100 },
    })
    expect(result.scale.method).toBe('grid')
    expect(result.scale.pixelsPerInch).toBeCloseTo(2, 10)
  })

  it('says so when a grid was found but nothing said what a square is worth', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: coarseTrace(0, 0, 400, 200),
      grid: { pitchPx: 24, confidence: 0.95, originOffsetPx: { x: 0, y: 0 } },
    })
    expect(result.scale.pixelsPerInch).toBeNull()
    expect(result.warnings.join(' ')).toContain('what one square is worth')
    // The grid is still worth snapping to even when it cannot set the scale.
    expect(result.steps.gridSnapped).toBe(true)
  })

  it('surfaces a labeled-dimension disagreement as a warning', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: coarseTrace(0, 0, 400, 200),
      labeledDimensions: [
        { p1: { x: 0, y: 0 }, p2: { x: 1200, y: 0 }, realInches: 100 },
        { p1: { x: 0, y: 0 }, p2: { x: 1560, y: 0 }, realInches: 100 },
      ],
    })
    expect(result.warnings.join(' ')).toContain('labeled dimensions 1 and 2 disagree')
    expect(result.scale.confidence).toBeLessThan(0.6)
  })

  it('keeps every candidate it considered, for the review UI', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: coarseTrace(0, 0, 400, 200),
      grid: { pitchPx: 24, confidence: 0.95, originOffsetPx: { x: 0, y: 0 } },
      gridSquareRealInches: 12,
      scaleBar: { p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, realInches: 100 },
      manual: { pxDistance: 300, realInches: 100 },
    })
    expect(result.scaleCandidates.map((c) => c.method)).toEqual(['grid', 'scale-bar', 'manual'])
    expect(result.scaleCandidate?.method).toBe('grid')
  })
})

describe('runPrecisionPipeline degenerate input', () => {
  it('does not throw on an empty or one-point polygon', () => {
    for (const polygonPx of [[], [{ x: 3, y: 4 }]]) {
      const result = runPrecisionPipeline({ ...NO_INPUT, polygonPx })
      expect(result.polygonPx.length).toBeLessThanOrEqual(1)
      expect(result.scale.pixelsPerInch).toBeNull()
    }
  })

  it('does not throw on a polygon of identical points', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: Array.from({ length: 50 }, () => ({ x: 10, y: 10 })),
      manual: { pxDistance: 100, realInches: 10 },
    })
    expect(result.polygonPx).toEqual([{ x: 10, y: 10 }])
  })

  it('drops non-finite points instead of propagating NaN into the quote', () => {
    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: [
        { x: 0, y: 0 },
        { x: Number.NaN, y: 40 },
        { x: 100, y: 0 },
        { x: 100, y: Number.POSITIVE_INFINITY },
        { x: 100, y: 80 },
      ],
      manual: { pxDistance: 100, realInches: 100 },
    })
    for (const p of result.polygonPx) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
    expect(result.polygonInches!.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(
      true,
    )
  })
})

describe('end to end from synthetic pixels', () => {
  it('detects a grid, resolves the scale, and measures a pool to within a percent', () => {
    // 20px per grid square, one square is one foot, so 20px = 12in.
    // The traced pool is 400 x 240 px = 20ft x 12ft = 240 sqft.
    const image = makeGridImage({
      pitchPx: 20,
      width: 640,
      height: 480,
      noiseAmp: 8,
      gradientAmp: 90,
      seed: 4,
    })
    const grid = detectGrid(image.data, image.width, image.height)
    expect(grid).not.toBeNull()

    const result = runPrecisionPipeline({
      ...NO_INPUT,
      polygonPx: coarseTrace(120, 100, 400, 240),
      grid,
      gridSquareRealInches: 12,
    })

    expect(result.scale.method).toBe('grid')
    expect(result.scale.pixelsPerInch!).toBeCloseTo(20 / 12, 2)

    const areaSqft = polygonAreaSqft(tuples(result.polygonInches!))
    expect(Math.abs(areaSqft - 240) / 240).toBeLessThan(0.01)
  })
})
