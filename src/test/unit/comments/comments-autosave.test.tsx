/** @vitest-environment jsdom */

// Does the first note on a project actually get saved?
//
// Commit 33d5ce0 fixed exactly this for shapes: the store subscription lived in
// a different effect from the hydrate, React ran the hydrate first, and the
// "ignore the hydrate" flag was spent by the first real edit instead. The first
// pool on every project vanished on reload and every later one survived.
//
// A note is a sentence somebody typed, so the same bug here would be worse: the
// first note on every drawing would be silently dropped, and the only evidence
// would be a builder swearing they wrote one.

import { createElement } from 'react'

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorPersistence } from '@/components/editor/EditorPersistence'
import type { DrawingComment } from '@/modules/editor/comments/model'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { emptyGrade } from '@/modules/editor/grade/model'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

const saveDrawing = vi.fn(async () => {})

vi.mock('@/modules/editor/persistence', () => ({
  saveDrawing: (...args: unknown[]) => saveDrawing(...(args as [])),
}))
vi.mock('@/lib/cache/editor', () => ({ recomputeAndCacheEditor: async () => {} }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const NOTE = {
  id: 'c1',
  x: 24,
  y: 48,
  body: 'Check the gas line clearance.',
  authorId: 'user-1',
  authorName: 'Dana Reyes',
  createdAt: '2026-08-19T10:00:00.000Z',
}

/** The notes handed to the most recent save. */
function lastSavedComments(): DrawingComment[] {
  const call = saveDrawing.mock.calls.at(-1) as unknown as [
    string,
    { comments?: DrawingComment[] },
  ]
  return call?.[1]?.comments ?? []
}

function mount(initialComments: DrawingComment[] = []) {
  return render(
    createElement(EditorPersistence, {
      projectId: 'p1',
      initial: { shapes: [], survey: null, grade: null, comments: initialComments },
    }),
  )
}

describe('autosaving notes', () => {
  beforeEach(() => {
    saveDrawing.mockClear()
    useShapesStore.getState().hydrate([])
    useCommentsStore.getState().hydrate([])
    useGradeStore.setState({ existing: emptyGrade(), finished: emptyGrade(), editing: 'existing' })
  })

  afterEach(cleanup)

  it('saves the very first note on a drawing', async () => {
    mount([])
    useCommentsStore.getState().addComment(NOTE)

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
    expect(lastSavedComments().map(c => c.body)).toEqual(['Check the gas line clearance.'])
  })

  it('saves the second note too, which is what used to be all that worked', async () => {
    mount([])
    useCommentsStore.getState().addComment(NOTE)
    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })

    saveDrawing.mockClear()
    useCommentsStore.getState().addComment({ ...NOTE, id: 'c2', body: 'Steps move left.' })
    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
    expect(lastSavedComments()).toHaveLength(2)
  })

  it('saves a resolve', async () => {
    mount([{ ...NOTE, resolved: false }])
    useCommentsStore.getState().setResolved('c1', true, 'Ray Ortiz', '2026-08-19T11:00:00.000Z')

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
    expect(lastSavedComments()[0]?.resolved).toBe(true)
  })

  it('saves the deletion of the last note', async () => {
    // The case that needs an empty list on the wire rather than a missing key.
    mount([{ ...NOTE, resolved: false }])
    useCommentsStore.getState().removeComment('c1')

    await waitFor(() => expect(saveDrawing).toHaveBeenCalled(), { timeout: 3_000 })
    expect(lastSavedComments()).toEqual([])
  })

  it('does not write anything just for opening a drawing that has notes', async () => {
    mount([{ ...NOTE, resolved: false }])
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(saveDrawing).not.toHaveBeenCalled()
  })

  it('does not write just for opening a note that was already there', async () => {
    // Opening a pin is reading, not editing. It shares a store with the notes,
    // so a subscription on the whole store rather than on `comments` would
    // touch the database every time somebody looked at one.
    mount([{ ...NOTE, resolved: false }])
    useCommentsStore.getState().setOpen('c1')
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(saveDrawing).not.toHaveBeenCalled()
  })
})
