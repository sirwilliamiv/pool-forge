import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  boxInPolygon,
  fitBoxInPolygon,
  pointInPolygon,
  type Box,
} from '@/lib/geometry/fitting'

/** A 100 x 100 square starting at the origin. */
const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

/** An L, so the bounding box contains space the ring does not. */
const L_SHAPE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 40, y: 40 },
  { x: 40, y: 100 },
  { x: 0, y: 100 },
]

describe('pointInPolygon', () => {
  it('finds a point inside', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, SQUARE)).toBe(true)
  })

  it('rejects a point outside', () => {
    expect(pointInPolygon({ x: 150, y: 50 }, SQUARE)).toBe(false)
  })

  // The whole reason the bounding box is not enough: this point is in the L's
  // bounding box and outside the L.
  it('rejects a point in the notch of a concave ring', () => {
    expect(pointInPolygon({ x: 80, y: 80 }, L_SHAPE)).toBe(false)
  })

  it('treats fewer than three points as having no inside', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false)
  })
})

describe('boxInPolygon', () => {
  it('accepts a box entirely inside', () => {
    expect(boxInPolygon({ x: 10, y: 10, width: 20, height: 20 }, SQUARE)).toBe(true)
  })

  it('rejects a box with one corner out', () => {
    expect(boxInPolygon({ x: 90, y: 90, width: 20, height: 20 }, SQUARE)).toBe(false)
  })
})

describe('fitBoxInPolygon', () => {
  it('leaves a box that already fits exactly where it was', () => {
    const box: Box = { x: 20, y: 20, width: 20, height: 20 }
    const result = fitBoxInPolygon(box, SQUARE)
    expect(result.outcome).toBe('already-inside')
    expect(result.box).toEqual(box)
    expect(result.scale).toBe(1)
  })

  it('slides a box that overshot an edge back inside, without resizing it', () => {
    const result = fitBoxInPolygon({ x: 95, y: 50, width: 20, height: 20 }, SQUARE)
    expect(result.outcome).toBe('moved')
    expect(result.scale).toBe(1)
    expect(result.box.width).toBe(20)
    expect(boxInPolygon(result.box, SQUARE)).toBe(true)
  })

  it('shrinks a box too big for the space', () => {
    const result = fitBoxInPolygon({ x: 0, y: 0, width: 400, height: 400 }, SQUARE)
    expect(result.outcome).toBe('resized')
    expect(result.scale).toBeLessThan(1)
    expect(boxInPolygon(result.box, SQUARE)).toBe(true)
  })

  it('keeps the aspect ratio when it shrinks', () => {
    const result = fitBoxInPolygon({ x: 0, y: 0, width: 400, height: 200 }, SQUARE)
    expect(result.box.width / result.box.height).toBeCloseTo(2, 5)
  })

  it('respects a margin, leaving clear space at the edge', () => {
    const result = fitBoxInPolygon({ x: 95, y: 95, width: 20, height: 20 }, SQUARE, { margin: 5 })
    expect(result.box.x + result.box.width).toBeLessThanOrEqual(95 + 1e-9)
    expect(result.box.y + result.box.height).toBeLessThanOrEqual(95 + 1e-9)
  })

  it('fits into the usable part of a concave space, not its bounding box', () => {
    const result = fitBoxInPolygon({ x: 70, y: 70, width: 30, height: 30 }, L_SHAPE)
    expect(result.outcome).not.toBe('impossible')
    expect(boxInPolygon(result.box, L_SHAPE)).toBe(true)
  })

  it('refuses rather than producing a useless sliver', () => {
    const tiny = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    const result = fitBoxInPolygon({ x: 0, y: 0, width: 40, height: 40 }, tiny, { minSize: 6 })
    expect(result.outcome).toBe('impossible')
  })

  it('treats a path with no inside as impossible', () => {
    expect(fitBoxInPolygon({ x: 0, y: 0, width: 10, height: 10 }, []).outcome).toBe('impossible')
  })

  // The property that matters: whenever it claims to have fitted something, the
  // result really is inside. A fit that reports success and leaves a corner out
  // is the bug this whole module exists to prevent.
  it('never reports success with the box still outside', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: -200, max: 300, noNaN: true }),
          y: fc.double({ min: -200, max: 300, noNaN: true }),
          width: fc.double({ min: 7, max: 300, noNaN: true }),
          height: fc.double({ min: 7, max: 300, noNaN: true }),
        }),
        fc.constantFrom(SQUARE, L_SHAPE),
        (box, polygon) => {
          const result = fitBoxInPolygon(box, polygon, { minSize: 6 })
          if (result.outcome === 'impossible') return
          expect(boxInPolygon(result.box, polygon)).toBe(true)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('never grows anything', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: -100, max: 200, noNaN: true }),
          y: fc.double({ min: -100, max: 200, noNaN: true }),
          width: fc.double({ min: 7, max: 200, noNaN: true }),
          height: fc.double({ min: 7, max: 200, noNaN: true }),
        }),
        (box) => {
          const result = fitBoxInPolygon(box, SQUARE)
          expect(result.box.width).toBeLessThanOrEqual(box.width + 1e-9)
          expect(result.box.height).toBeLessThanOrEqual(box.height + 1e-9)
        },
      ),
    )
  })
})
