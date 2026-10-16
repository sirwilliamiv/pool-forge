/** @vitest-environment jsdom */

// A stencil dropped on the canvas.
//
// Review Focus 4: in side elevation there is no ground under the pointer. The
// drop must be refused with a toast, never placed at the origin and never
// dispatched. And a file from the desktop is the panel's business, not ours.

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const canvas = document.createElement('canvas')
const hit: { current: { x: number; y: number; z: number } | null } = { current: null }

vi.mock('@react-three/fiber', () => ({ useThree: () => ({ gl: { domElement: canvas }, camera: {} }) }))
vi.mock('@/lib/three/ground', () => ({ groundPoint: vi.fn(() => hit.current) }))
vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn(async () => ({ ok: true, data: {} })) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

import { toast } from 'sonner'
import { dispatch } from '@/lib/commands/dispatch'
import { CanvasDropTarget } from '@/components/editor/three/CanvasDropTarget'
import { STENCIL_DRAG_MIME } from '@/modules/editor/interactions/stencil-drag'
import { VisioMessage } from '@/modules/imports/visio/types'

function dropEvent(type: string, data: Record<string, string>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', { value: 10 })
  Object.defineProperty(event, 'clientY', { value: 10 })
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: Object.keys(data),
      getData: (k: string) => data[k] ?? '',
      setData: () => undefined,
      dropEffect: 'none',
    },
  })
  return event
}

const payload = JSON.stringify({ source: 'catalog', id: 'pool.rectangle', widthIn: 360, heightIn: 168 })

describe('CanvasDropTarget', () => {
  beforeEach(() => {
    vi.mocked(dispatch).mockClear()
    vi.mocked(toast).mockClear()
    hit.current = null
  })

  it('refuses a drop with no ground point and dispatches nothing', () => {
    render(<CanvasDropTarget />)
    const event = dropEvent('drop', { [STENCIL_DRAG_MIME]: payload })
    canvas.dispatchEvent(event)
    expect(toast).toHaveBeenCalledWith(VisioMessage.NO_GROUND)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('places a catalogue stencil centred under the pointer', () => {
    hit.current = { x: 10, y: 0, z: 20 }
    render(<CanvasDropTarget />)
    const event = dropEvent('drop', { [STENCIL_DRAG_MIME]: payload })
    canvas.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('add.shape', { stencilId: 'pool.rectangle', x: -60, y: 156 })
  })

  it('leaves a file drag alone', () => {
    hit.current = { x: 0, y: 0, z: 0 }
    render(<CanvasDropTarget />)
    const over = dropEvent('dragover', { Files: '' })
    canvas.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(false)
    const drop = dropEvent('drop', { Files: '' })
    canvas.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('accepts a stencil drag over the canvas', () => {
    render(<CanvasDropTarget />)
    const over = dropEvent('dragover', { [STENCIL_DRAG_MIME]: '' })
    canvas.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
  })
})
