import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { addedIds, boxCorners, fullyVisible } from '@/modules/editor/visibility'

describe('boxCorners', () => {
  it('returns the four ground corners of a footprint', () => {
    const corners = boxCorners({ x: 0, y: 0, width: 10, height: 4 })
    expect(corners).toHaveLength(4)
    expect(corners).toContainEqual([0, 0, 0])
    expect(corners).toContainEqual([10, 0, 4])
  })

  it('adds a top face when the object has height', () => {
    expect(boxCorners({ x: 0, y: 0, width: 2, height: 2 }, 5)).toHaveLength(8)
  })
})

describe('fullyVisible', () => {
  it('accepts a box comfortably inside the frame', () => {
    expect(fullyVisible([{ x: 0, y: 0, z: 0 }, { x: 0.5, y: -0.3, z: 0.2 }])).toBe(true)
  })

  it('rejects a box with any corner outside', () => {
    expect(fullyVisible([{ x: 0, y: 0, z: 0 }, { x: 1.4, y: 0, z: 0 }])).toBe(false)
  })

  it('rejects a box at the very edge, which is half under a panel in practice', () => {
    expect(fullyVisible([{ x: 0.97, y: 0, z: 0 }])).toBe(false)
  })

  // The case that makes this more than an x/y comparison: a point behind the
  // camera projects to x and y that look perfectly central.
  it('rejects a point behind the camera', () => {
    expect(fullyVisible([{ x: 0, y: 0, z: -1.5 }])).toBe(false)
  })

  it('rejects a point beyond the far plane', () => {
    expect(fullyVisible([{ x: 0, y: 0, z: 1.5 }])).toBe(false)
  })

  it('treats an empty projection as not visible rather than trivially visible', () => {
    expect(fullyVisible([])).toBe(false)
  })

  it('rejects a projection that produced NaN', () => {
    expect(fullyVisible([{ x: Number.NaN, y: 0, z: 0 }])).toBe(false)
  })

  it('never claims a corner outside the margin is visible', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 0.4, noNaN: true }),
        (x, y, margin) => {
          const visible = fullyVisible([{ x, y, z: 0 }], margin)
          const limit = 1 - margin
          expect(visible).toBe(Math.abs(x) <= limit && Math.abs(y) <= limit)
        },
      ),
    )
  })
})

describe('addedIds', () => {
  it('reports only ids that were not there before', () => {
    expect(addedIds(new Set(['a']), [{ id: 'a' }, { id: 'b' }])).toEqual(['b'])
  })

  it('reports nothing when a shape is removed', () => {
    expect(addedIds(new Set(['a', 'b']), [{ id: 'a' }])).toEqual([])
  })

  it('preserves order, so the newest is last', () => {
    expect(addedIds(new Set(), [{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b'])
  })
})
