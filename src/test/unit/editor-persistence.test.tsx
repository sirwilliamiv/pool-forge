/** @vitest-environment jsdom */

// Does the drawing actually get saved?
//
// It did not, and the way it failed was the worst possible: the FIRST edit on
// every project was silently dropped and every edit after it was kept. Place a
// pool, reload, and it is gone; place two, and both survive. A builder cannot
// tell which of their work is real, and the save indicator said nothing either
// way.
//
// The cause was two effects and the order React runs them in. Hydration ran
// before the subscription existed, so the flag meant to swallow the hydrate was
// never spent by the hydrate and swallowed the first real edit instead.

import { createElement } from 'react'

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorPersistence } from '@/components/editor/EditorPersistence'
import { emptyGrade } from '@/modules/editor/grade/model'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { ShapeKind } from '@/modules/editor/state/shapes'

const saveDrawing = vi.fn(async () => {})

vi.mock('@/modules/editor/persistence', () => ({
  saveDrawing: (...args: unknown[]) => saveDrawing(...(args as [])),
}))
vi.mock('@/lib/cache/editor', () => ({ recomputeAndCacheEditor: async () => {} }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

/** Shapes handed to the most recent save. */
function lastSavedShapes(): unknown[] {
  const call = saveDrawing.mock.calls.at(-1) as unknown as [string, { shapes: unknown[] }]
  return call?.[1]?.shapes ?? []
}

function mount(initialShapes: unknown[] = []) {
  return render(
    createElement(EditorPersistence, {
      projectId: 'p1',
      initial: { shapes: initialShapes as never, survey: null, grade: null },
    }),
  )
}

describe('autosave', () => {
  beforeEach(() => {
    saveDrawing.mockClear()
    useShapesStore.getState().hydrate([])
    useGradeStore.setState({ existing: emptyGrade(), finished: emptyGrade(), editing: 'existing' })
  })

  afterEach(cleanup)

  it('saves the very first edit on a new project', async () => {
    // The exact defect. One pool, placed once, on an empty drawing.
    mount([])
    useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
    expect(lastSavedShapes()).toHaveLength(1)
  })

  it('does not write anything just for opening a project', async () => {
    // The reason the flag existed. Hydrating is not an edit, and writing on
    // every open would touch every drawing somebody merely looked at.
    mount([])
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(saveDrawing).not.toHaveBeenCalled()
  })

  it('does not write just for opening a drawing that already has shapes', async () => {
    mount([{ id: 's1', kind: ShapeKind.RECTANGLE_POOL, x: 0, y: 0, width: 10, height: 10 }])
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(saveDrawing).not.toHaveBeenCalled()
  })

  it('coalesces a burst of edits into one write', async () => {
    mount([])
    for (let i = 0; i < 5; i++) useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, i, i)

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
    expect(saveDrawing.mock.calls.length).toBeLessThanOrEqual(2)
    expect(lastSavedShapes()).toHaveLength(5)
  })

  it('saves a change to the site elevations', async () => {
    // Grading had no subscription at all, so elevations were only ever written
    // when a shape happened to change in the same session.
    mount([])
    useGradeStore.getState().addPoint({ x: 0, y: 0, elevationFt: -3 })

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
  })

  it('writes pending work when the editor goes away', async () => {
    // Navigating away inside the debounce window is a normal thing to do, and
    // eight hundred milliseconds is a short window.
    const view = mount([])
    useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    view.unmount()

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 2_000 })
    expect(lastSavedShapes()).toHaveLength(1)
  })

  it('writes pending work when the tab is closing', async () => {
    mount([])
    useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    window.dispatchEvent(new Event('pagehide'))

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 2_000 })
  })

  it('saves the second edit too, which is all that used to work', async () => {
    mount([])
    useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })

    saveDrawing.mockClear()
    useShapesStore.getState().addShape(ShapeKind.SPA, 50, 50)
    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
    expect(lastSavedShapes()).toHaveLength(2)
  })
})
