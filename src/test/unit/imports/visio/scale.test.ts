import { describe, expect, it } from 'vitest'
import { normalizeRings, scaleRings } from '@/modules/imports/visio/scale'
import { VISIO_SCALE_DEFAULT } from '@/modules/imports/visio/types'

describe('scale', () => {
  const rect = [[{ x: 0.25, y: 0.5 }, { x: 3.375, y: 0.5 }, { x: 3.375, y: 2 }, { x: 0.25, y: 2 }]]

  it('moves the bounding box to the origin', () => {
    const n = normalizeRings(rect)
    expect(n.rings[0]?.[0]).toEqual({ x: 0, y: 0 })
    expect(n.widthIn).toBeCloseTo(3.125, 9)
    expect(n.heightIn).toBeCloseTo(1.5, 9)
  })

  it('turns the Standard Rectangle into 25 by 12 feet', () => {
    const s = scaleRings(normalizeRings(rect).rings, VISIO_SCALE_DEFAULT)
    expect(s.widthIn).toBeCloseTo(300, 6)
    expect(s.heightIn).toBeCloseTo(144, 6)
    expect(s.rings[0]).toEqual([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 144 }, { x: 0, y: 144 }])
  })

  it('normalizes against the footprint, not the detail', () => {
    const detail = [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 11, y: 11 }]
    const n = normalizeRings([...rect, detail])
    expect(n.widthIn).toBeCloseTo(3.125, 9)
    expect(n.rings[1]?.[0]).toEqual({ x: 9.75, y: 9.5 })
  })
})
