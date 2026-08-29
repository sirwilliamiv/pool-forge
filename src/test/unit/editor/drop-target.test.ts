import { describe, expect, it } from 'vitest'

import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { spaceUnder } from '@/modules/editor/interactions/drag'
import { useDrawStore } from '@/modules/editor/state/drawStore'

function outline(id: string, x = 0, y = 0): Shape {
  return {
    id,
    kind: ShapeKind.SKETCH_PATH,
    x,
    y,
    width: 120,
    height: 120,
    rotation: 0,
    zIndex: 0,
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ],
    closed: true,
  } as Shape
}

describe('the drop target the scene lights up', () => {
  it('starts with nothing highlighted', () => {
    useDrawStore.getState().setDropTarget(null)
    expect(useDrawStore.getState().dropTargetId).toBeNull()
  })

  it('holds the space a drag is over', () => {
    const space = spaceUnder({ x: 60, y: 60 }, [outline('lanai')])
    useDrawStore.getState().setDropTarget(space?.id ?? null)
    expect(useDrawStore.getState().dropTargetId).toBe('lanai')
  })

  // The drag handler clears this on both pointerup and pointercancel. A
  // highlight that outlives its drag is a space that looks like it is about to
  // catch something when nothing is moving.
  it('clears back to nothing', () => {
    useDrawStore.getState().setDropTarget('lanai')
    useDrawStore.getState().setDropTarget(null)
    expect(useDrawStore.getState().dropTargetId).toBeNull()
  })

  it('is nothing when the drag is over open ground', () => {
    const space = spaceUnder({ x: 900, y: 900 }, [outline('lanai')])
    expect(space).toBeNull()
  })
})
