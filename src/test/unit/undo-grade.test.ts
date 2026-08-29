// Undo has to put the whole drawing back, not half of it.
//
// History snapshotted shapes alone. Grading arrived afterwards and was not
// wired in, so undoing a change to an elevation reverted an unrelated shape
// instead: the ground stayed where it was and something the user had not
// touched moved. A safety net with a hole in it is worse than none, because it
// is trusted.

import { beforeEach, describe, expect, it } from 'vitest'

import { emptyGrade } from '@/modules/editor/grade/model'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { ShapeKind } from '@/modules/editor/state/shapes'

function reset(): void {
  useShapesStore.getState().hydrate([])
  useGradeStore.setState({ existing: emptyGrade(), finished: emptyGrade(), editing: 'existing' })
  useHistoryStore.getState().reset()
}

const points = () => useGradeStore.getState().existing.points

describe('undo across the whole drawing', () => {
  beforeEach(reset)

  it('takes back an elevation', () => {
    useGradeStore.getState().addPoint({ x: 120, y: 240, elevationFt: -3 })
    expect(points()).toHaveLength(1)

    useHistoryStore.getState().undo()
    expect(points()).toHaveLength(0)
  })

  it('takes back a change to an elevation, not just its creation', () => {
    useGradeStore.getState().addPoint({ x: 0, y: 0, elevationFt: -3 })
    const id = points()[0]!.id
    useGradeStore.getState().updatePoint(id, { elevationFt: -8 })
    expect(points()[0]?.elevationFt).toBe(-8)

    useHistoryStore.getState().undo()
    expect(points()[0]?.elevationFt).toBe(-3)
  })

  it('puts it back again on redo', () => {
    useGradeStore.getState().addPoint({ x: 0, y: 0, elevationFt: -3 })
    useHistoryStore.getState().undo()
    useHistoryStore.getState().redo()
    expect(points()).toHaveLength(1)
  })

  it('does not move a shape when the user undoes a grade change', () => {
    // The exact failure. A shape edit and a grade edit shared one stack that
    // only remembered shapes, so undoing the second reverted the first.
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    useShapesStore.getState().updateShape(id, { x: 500 })
    useGradeStore.getState().addPoint({ x: 0, y: 0, elevationFt: -3 })

    useHistoryStore.getState().undo()

    expect(points(), 'the grade change should be what was undone').toHaveLength(0)
    expect(
      useShapesStore.getState().shapes.find((s) => s.id === id)?.x,
      'the shape must not move',
    ).toBe(500)
  })

  it('does not lose the grade when the user undoes a shape change', () => {
    // The other direction: a shape snapshot with no grade in it would restore
    // an empty site and wipe elevations that were never touched.
    useGradeStore.getState().addPoint({ x: 0, y: 0, elevationFt: -3 })
    const id = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    useShapesStore.getState().updateShape(id, { x: 500 })

    useHistoryStore.getState().undo()

    expect(useShapesStore.getState().shapes.find((s) => s.id === id)?.x).toBe(0)
    expect(points(), 'the elevations must survive').toHaveLength(1)
  })

  it('restores turning grading on', () => {
    useGradeStore.getState().setEnabled(true)
    expect(useGradeStore.getState().existing.enabled).toBe(true)

    useHistoryStore.getState().undo()
    expect(useGradeStore.getState().existing.enabled).toBe(false)
  })

  it('has nothing to undo on a fresh canvas', () => {
    expect(useHistoryStore.getState().canUndo()).toBe(false)
  })
})
