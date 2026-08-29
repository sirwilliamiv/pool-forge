// Where an object lands when it is added from the panel.
//
// The old rule anchored to ShapeKind.RECTANGLE_POOL alone, so a Grecian or a
// pool-and-spa left every later object stranded at the origin on top of each
// other, and its fixed 36-inch stagger ran thirty-six objects about ninety-six
// feet down the sheet in one column.

import { describe, expect, it } from 'vitest'

import { stagedCount, stagingPlacement, visibleBounds } from '@/modules/editor/placement'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'

function shape(overrides: Record<string, unknown>): Shape {
  return {
    id: 'x',
    kind: ShapeKind.STENCIL,
    x: 0,
    y: 0,
    width: 96,
    height: 96,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    ...overrides,
  } as Shape
}

const rectPool = shape({ id: 'p', kind: ShapeKind.RECTANGLE_POOL, width: 384, height: 192 })
/** A Grecian is a stencil-kind pool, which is exactly what the old rule missed. */
const grecianPool = shape({ id: 'g', stencilId: 'pool.grecian', width: 384, height: 192 })

describe('visibleBounds', () => {
  it('is null on an empty canvas', () => {
    expect(visibleBounds([])).toBeNull()
  })

  it('spans everything, not just the first shape', () => {
    const box = visibleBounds([shape({ id: 'a' }), shape({ id: 'b', x: 500, y: 300 })])
    expect(box).toEqual({ x: 0, y: 0, width: 596, height: 396 })
  })

  it('ignores hidden shapes', () => {
    const box = visibleBounds([shape({ id: 'a' }), shape({ id: 'b', x: 5_000, hidden: true })])
    expect(box?.width).toBe(96)
  })
})

describe('stagingPlacement', () => {
  it('places clear of a rectangular pool', () => {
    const { x } = stagingPlacement([rectPool], 'site.tree', 0)
    expect(x).toBeGreaterThanOrEqual(rectPool.x + rectPool.width)
  })

  it('places clear of a pool that is not a rectangle', () => {
    // The regression. A Grecian is a STENCIL kind, so the old rule found no pool
    // and dropped everything at the origin, on top of the pool itself.
    const { x } = stagingPlacement([grecianPool], 'site.tree', 0)
    expect(x).toBeGreaterThanOrEqual(grecianPool.x + grecianPool.width)
  })

  it('wraps into columns instead of running down the page', () => {
    // Thirty-six objects used to span about ninety-six feet in a line.
    const placements = Array.from({ length: 36 }, (_, i) =>
      stagingPlacement([rectPool], 'site.tree', i),
    )
    const ys = placements.map(p => p.y)
    const spanFt = (Math.max(...ys) - Math.min(...ys)) / 12
    expect(spanFt).toBeLessThan(60)
    // And it genuinely used more than one column to do it.
    expect(new Set(placements.map(p => p.x)).size).toBeGreaterThan(1)
  })

  it('never puts two staged objects in the same slot', () => {
    const seen = new Set(
      Array.from({ length: 20 }, (_, i) => {
        const p = stagingPlacement([rectPool], 'site.tree', i)
        return `${p.x},${p.y}`
      }),
    )
    expect(seen.size).toBe(20)
  })

  it('starts at the origin when the canvas is empty', () => {
    expect(stagingPlacement([], 'site.tree', 0)).toEqual({ x: 0, y: 0 })
  })

  it('gives a large stencil a larger slot than a small one', () => {
    // Fixed spacing overlapped anything bigger than the stagger.
    const small = stagingPlacement([], 'feature.light', 1)
    const large = stagingPlacement([], 'deck.lanai', 1)
    expect(large.y).toBeGreaterThan(small.y)
  })
})

describe('stagedCount', () => {
  it('counts only stencils still visible', () => {
    expect(
      stagedCount([rectPool, grecianPool, shape({ id: 'h', hidden: true })]),
    ).toBe(1)
  })
})
