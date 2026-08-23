// Click to place, drag to size.
//
// Dragging out a shape placed nothing at all: the release was compared against
// the press in pixels, anything past four of them was read as a camera orbit,
// and the gesture was dropped in silence. A first-time user drags, sees
// nothing, and concludes the app ignored them.
//
// Clicking had a quieter bug. `shape.x` is the top-left corner and the renderer
// adds half the width, so passing the clicked point straight through put a
// thirty foot pool fifteen feet down and right of the cursor.

import { describe, expect, it } from 'vitest'

import { MIN_DRAG_FT, placementFrom } from '@/modules/editor/interactions/gestures'

const POOL = { widthIn: 360, heightIn: 168 }

describe('clicking to place', () => {
  it('centres the shape on the point clicked', () => {
    const p = placementFrom(null, { x: 10, z: 20 }, POOL)
    expect(p.width).toBe(360)
    expect(p.height).toBe(168)
    // Centre of the placed rectangle is the click, in inches.
    expect(p.x + p.width / 2).toBe(10 * 12)
    expect(p.y + p.height / 2).toBe(20 * 12)
  })

  it('treats a press and release in the same spot as a click', () => {
    const here = { x: 4, z: -6 }
    expect(placementFrom(here, here, POOL)).toEqual(placementFrom(null, here, POOL))
  })

  it('treats a twitch as a click, not a very small pool', () => {
    const p = placementFrom({ x: 0, z: 0 }, { x: MIN_DRAG_FT / 2, z: MIN_DRAG_FT / 2 }, POOL)
    expect(p.width).toBe(360)
    expect(p.height).toBe(168)
  })
})

describe('dragging to size', () => {
  it('places the shape in the rectangle that was dragged', () => {
    const p = placementFrom({ x: 2, z: 3 }, { x: 22, z: 17 }, POOL)
    expect(p.x).toBe(2 * 12)
    expect(p.y).toBe(3 * 12)
    expect(p.width).toBe(20 * 12)
    expect(p.height).toBe(14 * 12)
  })

  it('works dragged in any direction', () => {
    const forward = placementFrom({ x: 2, z: 3 }, { x: 22, z: 17 }, POOL)
    const backward = placementFrom({ x: 22, z: 17 }, { x: 2, z: 3 }, POOL)
    expect(backward).toEqual(forward)
  })

  it('ignores a drag along one edge only', () => {
    // Zero thickness is not a pool, and cannot be clicked on again afterwards.
    const p = placementFrom({ x: 0, z: 0 }, { x: 40, z: 0.2 }, POOL)
    expect(p.width).toBe(360)
    expect(p.height).toBe(168)
  })

  it('never produces a negative or zero extent', () => {
    for (const to of [{ x: -30, z: -20 }, { x: 30, z: -20 }, { x: -30, z: 20 }]) {
      const p = placementFrom({ x: 0, z: 0 }, to, POOL)
      expect(p.width).toBeGreaterThan(0)
      expect(p.height).toBeGreaterThan(0)
    }
  })
})
