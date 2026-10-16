import { describe, expect, it } from 'vitest'
import { planDrop } from '@/modules/editor/interactions/canvas-drop'

describe('planDrop', () => {
  it('centres a catalogue stencil under the pointer in inches', () => {
    // 10 ft, 20 ft on the ground is 120, 240 inches; a 360 by 168 pool is offset by half.
    expect(planDrop({ source: 'catalog', id: 'pool.rectangle', widthIn: 360, heightIn: 168 }, { x: 10, z: 20 }))
      .toEqual({ command: 'add.shape', input: { stencilId: 'pool.rectangle', x: -60, y: 156 } })
  })
  it('routes a library stencil to its own command', () => {
    expect(planDrop({ source: 'library', id: 'clx1', widthIn: 300, heightIn: 144 }, { x: 25, z: 12 }))
      .toEqual({ command: 'stencil.library.place', input: { orgStencilId: 'clx1', x: 150, y: 72 } })
  })
  it('says no-ground in side elevation and null for a non-stencil drag', () => {
    expect(planDrop({ source: 'catalog', id: 'pool.rectangle', widthIn: 1, heightIn: 1 }, null)).toBe('no-ground')
    expect(planDrop(null, { x: 0, z: 0 })).toBeNull()
  })
})
