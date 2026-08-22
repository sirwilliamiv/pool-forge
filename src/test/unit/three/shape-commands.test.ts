// What the editor commands report back.
//
// Every mutation used to echo the id it was handed, so a command against a shape
// that was not there succeeded and changed nothing. Watching a real session, the
// agent told the user the concrete deck was gone three times while they were
// looking at it, and had no way to know it was wrong.

import { beforeEach, describe, expect, it } from 'vitest'

import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { ShapeKind } from '@/modules/editor/state/shapes'

function reset(): void {
  useShapesStore.getState().clear()
  useHistoryStore.setState({ past: [], future: [] })
}

describe('delete and history', () => {
  beforeEach(reset)

  it('removes a shape that exists', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    useShapesStore.getState().removeShapes([id])
    expect(useShapesStore.getState().shapes).toHaveLength(0)
  })

  it('undo brings back a deleted pool', () => {
    // The whole reason undo had to become a command. A misheard sentence
    // deleted someone's pool and the agent could only ask whether *they* had an
    // undo button.
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    useShapesStore.getState().removeShapes([id])
    expect(useShapesStore.getState().shapes).toHaveLength(0)

    expect(useHistoryStore.getState().canUndo()).toBe(true)
    useHistoryStore.getState().undo()
    expect(useShapesStore.getState().shapes).toHaveLength(1)
  })

  it('redo puts it back again', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    useShapesStore.getState().removeShapes([id])
    useHistoryStore.getState().undo()
    expect(useHistoryStore.getState().canRedo()).toBe(true)
    useHistoryStore.getState().redo()
    expect(useShapesStore.getState().shapes).toHaveLength(0)
  })

  it('reports nothing to undo on a fresh canvas', () => {
    // So the agent says "there is nothing to undo" rather than claiming it did.
    expect(useHistoryStore.getState().canUndo()).toBe(false)
  })
})

describe('pool trim', () => {
  beforeEach(reset)

  it('defaults to having coping, because a real pool does', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    const shape = useShapesStore.getState().shapes.find((s) => s.id === id)
    expect(shape?.displayHint?.coping).toBeUndefined()
  })

  it('can be turned off, which is the only way it comes off', () => {
    // Coping is part of the pool's own mesh: it has no id and cannot be deleted.
    // Asked to remove it, the agent called delete commands that succeeded and
    // the concrete stayed exactly where it was.
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    useShapesStore.getState().updateShape(id, { displayHint: { coping: false } })
    const shape = useShapesStore.getState().shapes.find((s) => s.id === id)
    expect(shape?.displayHint?.coping).toBe(false)
  })

  it('keeps the other trim when only one is changed', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    useShapesStore.getState().updateShape(id, { displayHint: { coping: false, tileBand: true } })
    const shape = useShapesStore.getState().shapes.find((s) => s.id === id)
    expect(shape?.displayHint?.tileBand).toBe(true)
  })
})
