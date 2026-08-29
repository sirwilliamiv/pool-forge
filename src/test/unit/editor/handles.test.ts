// Dragging a handle to resize, and the invariants that make it feel right.
//
// The editor had no handles at all: a pool could only be resized by typing
// numbers into the inspector, which `docs/build-priority.md` recorded as a gap
// under item 5. The maths lives apart from the canvas so it can be checked
// without one, because "the corner I am not holding must not move" is a
// property, not a screenshot.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  MAX_SIZE_IN,
  MIN_SIZE_IN,
  RESIZE_HANDLES,
  centreOf,
  grabOffsetFor,
  handlePositions,
  normalizeDegrees,
  resizeBox,
  rotateGripPosition,
  rotationFrom,
  toLocal,
  toWorld,
  type Box,
  type ResizeHandle,
} from '@/modules/editor/interactions/handles'

const POOL: Box = { x: 0, y: 0, width: 360, height: 168, rotation: 0 }

/** The corner diagonally opposite the one being dragged. */
function oppositeCornerOf(box: Box, handle: ResizeHandle): { x: number; y: number } {
  const opposite = handle
    .replace('n', 'S').replace('s', 'N')
    .replace('e', 'W').replace('w', 'E')
    .toLowerCase() as ResizeHandle
  const found = handlePositions(box).find(h => h.handle === opposite)
  if (!found) throw new Error(`no handle opposite ${handle}`)
  return found.at
}

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol

describe('where the handles are', () => {
  it('puts one at every corner and every edge', () => {
    const positions = handlePositions(POOL)
    expect(positions).toHaveLength(8)
    expect(new Set(positions.map(p => p.handle))).toEqual(new Set(RESIZE_HANDLES))
  })

  it('puts the corners on the corners', () => {
    const at = new Map(handlePositions(POOL).map(p => [p.handle, p.at]))
    expect(at.get('nw')).toEqual({ x: 0, y: 0 })
    expect(at.get('se')).toEqual({ x: 360, y: 168 })
  })

  it('carries the handles round with the shape when it is rotated', () => {
    const turned: Box = { ...POOL, rotation: 90 }
    const nw = handlePositions(turned).find(h => h.handle === 'nw')!.at
    // A quarter turn puts the top-left corner where the bottom-left was.
    const c = centreOf(turned)
    expect(near(nw.x, c.x + POOL.height / 2, 1e-9)).toBe(true)
    expect(near(nw.y, c.y - POOL.width / 2, 1e-9)).toBe(true)
  })

  it('keeps the rotate grip clear of the north handle', () => {
    const grip = rotateGripPosition(POOL)
    const north = handlePositions(POOL).find(h => h.handle === 'n')!.at
    expect(grip.y).toBeLessThan(north.y)
  })
})

describe('local and world are inverses', () => {
  it('round-trips any point through any rotation', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: -5_000, max: 5_000 }),
          y: fc.integer({ min: -5_000, max: 5_000 }),
          width: fc.integer({ min: MIN_SIZE_IN, max: MAX_SIZE_IN }),
          height: fc.integer({ min: MIN_SIZE_IN, max: MAX_SIZE_IN }),
          rotation: fc.integer({ min: -720, max: 720 }),
        }),
        fc.integer({ min: -9_000, max: 9_000 }),
        fc.integer({ min: -9_000, max: 9_000 }),
        (box, px, py) => {
          const back = toWorld(box, toLocal(box, { x: px, y: py }))
          expect(near(back.x, px, 1e-6)).toBe(true)
          expect(near(back.y, py, 1e-6)).toBe(true)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('dragging a corner', () => {
  it('leaves the opposite corner exactly where it was', () => {
    // The property that makes a resize a resize. If this drifts, the shape
    // slides across the drawing while being resized and nothing lines up.
    fc.assert(
      fc.property(
        fc.constantFrom(...(['nw', 'ne', 'se', 'sw'] as const)),
        fc.integer({ min: -2_000, max: 2_000 }),
        fc.integer({ min: -2_000, max: 2_000 }),
        fc.integer({ min: -180, max: 180 }),
        (handle, px, py, rotation) => {
          const start: Box = { ...POOL, rotation }
          const before = oppositeCornerOf(start, handle)
          const after = oppositeCornerOf(resizeBox(start, handle, { x: px, y: py }), handle)
          expect(near(before.x, after.x, 1e-6)).toBe(true)
          expect(near(before.y, after.y, 1e-6)).toBe(true)
        },
      ),
      { numRuns: 400 },
    )
  })

  it('follows the cursor', () => {
    const out = resizeBox(POOL, 'se', { x: 600, y: 400 })
    expect(out.width).toBe(600)
    expect(out.height).toBe(400)
    expect(out.x).toBe(0)
    expect(out.y).toBe(0)
  })
})

describe('dragging an edge', () => {
  it('changes one axis and leaves the other alone', () => {
    const east = resizeBox(POOL, 'e', { x: 500, y: 9_999 })
    expect(east.width).toBe(500)
    expect(east.height).toBe(POOL.height)

    const south = resizeBox(POOL, 's', { x: 9_999, y: 300 })
    expect(south.height).toBe(300)
    expect(south.width).toBe(POOL.width)
  })
})

describe('what a resize will never do', () => {
  it('never inverts the shape, however far past itself you drag', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RESIZE_HANDLES),
        fc.integer({ min: -9_000, max: 9_000 }),
        fc.integer({ min: -9_000, max: 9_000 }),
        (handle, px, py) => {
          const out = resizeBox(POOL, handle, { x: px, y: py })
          expect(out.width).toBeGreaterThanOrEqual(MIN_SIZE_IN)
          expect(out.height).toBeGreaterThanOrEqual(MIN_SIZE_IN)
        },
      ),
      { numRuns: 400 },
    )
  })

  it('never exceeds the maximum, which exists because nothing used to', () => {
    // A tester typed 99999 into the inspector, the app took it, and the job
    // quoted at $144,116,399.
    const out = resizeBox(POOL, 'se', { x: 9_999_999, y: 9_999_999 })
    expect(out.width).toBeLessThanOrEqual(MAX_SIZE_IN)
    expect(out.height).toBeLessThanOrEqual(MAX_SIZE_IN)
  })

  it('never changes the rotation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RESIZE_HANDLES),
        fc.integer({ min: -360, max: 360 }),
        (handle, rotation) => {
          const out = resizeBox({ ...POOL, rotation }, handle, { x: 500, y: 500 })
          expect(out.rotation).toBe(rotation)
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('holding the ratio', () => {
  it('keeps the shape of the shape', () => {
    const ratio = POOL.width / POOL.height
    const out = resizeBox(POOL, 'se', { x: 720, y: 100 }, { preserveRatio: true })
    expect(near(out.width / out.height, ratio, 1e-6)).toBe(true)
  })

  it('holds the ratio from an edge handle too', () => {
    const ratio = POOL.width / POOL.height
    const out = resizeBox(POOL, 'e', { x: 720, y: 0 }, { preserveRatio: true })
    expect(near(out.width / out.height, ratio, 1e-6)).toBe(true)
  })
})

describe('rotating', () => {
  it('does not jump when you first grab the grip', () => {
    const grip = rotateGripPosition(POOL)
    const offset = grabOffsetFor(POOL, grip)
    expect(rotationFrom(POOL, grip, offset)).toBe(normalizeDegrees(POOL.rotation))
  })

  it('turns with the pointer', () => {
    const c = centreOf(POOL)
    const grip = rotateGripPosition(POOL)
    const offset = grabOffsetFor(POOL, grip)
    // Straight out to the right of the centre is a quarter turn clockwise.
    const out = rotationFrom(POOL, { x: c.x + 500, y: c.y }, offset)
    expect(near(out, 90, 1e-6)).toBe(true)
  })

  it('snaps only when asked', () => {
    const c = centreOf(POOL)
    const offset = grabOffsetFor(POOL, rotateGripPosition(POOL))
    const at = { x: c.x + 500, y: c.y - 40 }
    expect(rotationFrom(POOL, at, offset, true) % 15).toBe(0)
    expect(rotationFrom(POOL, at, offset, false) % 15).not.toBe(0)
  })

  it('always reports an angle a person would recognise', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2_000, max: 2_000 }), deg => {
        const out = normalizeDegrees(deg)
        expect(out).toBeGreaterThanOrEqual(0)
        expect(out).toBeLessThan(360)
      }),
      { numRuns: 300 },
    )
  })
})
