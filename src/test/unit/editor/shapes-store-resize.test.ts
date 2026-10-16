import { beforeEach, describe, expect, it } from 'vitest'

import { ShapeKind, isPolygonPool, isSketchPath } from '@/modules/editor/state/shapes'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

// A freeform pool or a drawn outline is its ring; the box only describes it.
// The handles and the inspector write the box, so the ring has to follow, or
// the quote and the layer list change while the drawing does not move.

const ring = [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 120 }, { x: 0, y: 120 }]

function shape(id: string) {
  const found = useShapesStore.getState().shapes.find((s) => s.id === id)
  if (!found) throw new Error(`no shape ${id}`)
  return found
}

describe('resizing a ring-backed shape', () => {
  beforeEach(() => useShapesStore.getState().hydrate([]))

  it('scales a freeform pool ring to the new box', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.POLYGON_POOL, 0, 0, { width: 240, height: 120, points: ring })
    useShapesStore.getState().updateShape(id, { width: 480, height: 60 })
    const pool = shape(id)
    expect(isPolygonPool(pool) && pool.points).toEqual([
      { x: 0, y: 0 }, { x: 480, y: 0 }, { x: 480, y: 60 }, { x: 0, y: 60 },
    ])
  })

  it('scales a drawn outline the same way', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.SKETCH_PATH, 0, 0, { width: 240, height: 120, points: ring, closed: true })
    useShapesStore.getState().updateShape(id, { width: 120 })
    const sketch = shape(id)
    expect(isSketchPath(sketch) && sketch.points.map((p) => p.x)).toEqual([0, 120, 120, 0])
    expect(isSketchPath(sketch) && sketch.points.map((p) => p.y)).toEqual([0, 0, 120, 120])
  })

  it('lets a patch that carries its own points win', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.POLYGON_POOL, 0, 0, { width: 240, height: 120, points: ring })
    const triangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 50 }]
    useShapesStore.getState().updateShape(id, { width: 100, height: 50, points: triangle })
    const pool = shape(id)
    expect(isPolygonPool(pool) && pool.points).toEqual(triangle)
  })

  it('leaves the ring alone when only the position changes', () => {
    const id = useShapesStore.getState().addShape(ShapeKind.POLYGON_POOL, 0, 0, { width: 240, height: 120, points: ring })
    useShapesStore.getState().updateShape(id, { x: 50, y: 70 })
    const pool = shape(id)
    expect(isPolygonPool(pool) && pool.points).toEqual(ring)
  })
})
