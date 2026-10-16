// The payload a stencil card hands the canvas.
//
// The failure this guards: a drop that reads the wrong type, or a malformed
// payload, and places something at the origin or nothing at all with a
// success toast. Everything here is pure, so it runs without a canvas.

import { describe, expect, it } from 'vitest'

import {
  DROP_COMMAND,
  STENCIL_DRAG_MIME,
  StencilDragSource,
  decodeStencilDrag,
  dropTopLeft,
  encodeStencilDrag,
  hasStencilDrag,
} from '@/modules/editor/interactions/stencil-drag'

/** A DataTransfer that behaves like the browser's: types reflect what was set. */
function fakeTransfer(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get types() {
      return [...data.keys()]
    },
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => {
      data.set(format, value)
    },
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
  }
}

describe('stencil drag payload', () => {
  it('round-trips a catalogue stencil', () => {
    const dt = fakeTransfer()
    encodeStencilDrag(dt, { source: StencilDragSource.CATALOG, id: 'pool.rectangle', widthIn: 360, heightIn: 168 })
    expect(hasStencilDrag(dt.types)).toBe(true)
    expect(dt.effectAllowed).toBe('copy')
    expect(decodeStencilDrag(dt)).toEqual({
      source: 'catalog',
      id: 'pool.rectangle',
      widthIn: 360,
      heightIn: 168,
    })
  })

  it('round-trips a library stencil and names the right command', () => {
    const dt = fakeTransfer()
    encodeStencilDrag(dt, { source: StencilDragSource.LIBRARY, id: 'clx123', widthIn: 300, heightIn: 144 })
    const payload = decodeStencilDrag(dt)
    expect(payload?.source).toBe('library')
    expect(DROP_COMMAND[payload!.source]).toBe('stencil.library.place')
    expect(DROP_COMMAND.catalog).toBe('add.shape')
  })

  it('is not a file drag', () => {
    // A .vss dragged from the desktop is the panel's import, never a placement.
    expect(hasStencilDrag(['Files'])).toBe(false)
    expect(decodeStencilDrag(fakeTransfer({ Files: '' }))).toBeNull()
    expect(hasStencilDrag(undefined)).toBe(false)
  })

  it('refuses malformed payloads rather than placing at the origin', () => {
    const cases = [
      'not json',
      JSON.stringify({ source: 'catalog' }),
      JSON.stringify({ source: 'elsewhere', id: 'x', widthIn: 1, heightIn: 1 }),
      JSON.stringify({ source: 'library', id: '', widthIn: 1, heightIn: 1 }),
      JSON.stringify({ source: 'library', id: 'x', widthIn: 0, heightIn: 1 }),
      JSON.stringify({ source: 'library', id: 'x', widthIn: 1, heightIn: Number.NaN }),
    ]
    for (const raw of cases) {
      expect(decodeStencilDrag(fakeTransfer({ [STENCIL_DRAG_MIME]: raw })), raw).toBeNull()
    }
  })

  it('centres the shape under the pointer, on whole inches', () => {
    expect(dropTopLeft({ x: 500, y: 300 }, 360, 168)).toEqual({ x: 320, y: 216 })
    expect(dropTopLeft({ x: 143.72, y: 10.4 }, 25, 11)).toEqual({ x: 131, y: 5 })
  })
})
