/** @vitest-environment jsdom */

// Notes pinned to the drawing: the store, the model, and undo.
//
// The two failure modes worth guarding here are both ones this codebase has
// already shipped once. A note that reads back differently from the way it was
// written is the drawing-payload defect; a note that undo cannot reach is the
// grading defect, where an entire class of edit was outside the safety net and
// nobody noticed until undo reverted something else instead.

import { beforeEach, describe, expect, it } from 'vitest'

import {
  commentInitials,
  parseComments,
  relativeTime,
  sortedForList,
  unresolvedCount,
  type DrawingComment,
} from '@/modules/editor/comments/model'
import { parseDrawingPayload, serializeDrawingPayload } from '@/modules/editor/drawing-payload'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

const AT = '2026-08-19T10:00:00.000Z'

function note(over: Partial<DrawingComment> = {}): DrawingComment {
  return {
    id: 'c1',
    x: 120,
    y: -36,
    body: 'Check the gas line clearance.',
    authorId: 'user-1',
    authorName: 'Dana Reyes',
    createdAt: AT,
    resolved: false,
    ...over,
  }
}

beforeEach(() => {
  useCommentsStore.getState().hydrate([])
  useShapesStore.getState().hydrate([])
  useHistoryStore.getState().reset()
})

describe('a note survives the round trip through rootJson', () => {
  it('comes back with its text, its position, its author and its time', () => {
    const stored = serializeDrawingPayload({
      shapes: [],
      survey: null,
      comments: [note({ resolved: true, resolvedAt: AT, resolvedByName: 'Ray' })],
    })
    const back = parseDrawingPayload(stored).comments ?? []

    expect(back).toHaveLength(1)
    expect(back[0]).toEqual(note({ resolved: true, resolvedAt: AT, resolvedByName: 'Ray' }))
  })

  it('writes an empty list rather than dropping the key', () => {
    // Deleting the last note has to be saveable. A serializer that omitted the
    // key would leave the old list in the column and the note would come back
    // on the next reload.
    const stored = serializeDrawingPayload({ shapes: [], survey: null, comments: [] })
    expect(stored.comments).toEqual([])
    expect(parseDrawingPayload(stored).comments).toEqual([])
  })

  it('opens a drawing made before comments existed', () => {
    expect(parseDrawingPayload({ shapes: [], survey: null }).comments).toEqual([])
  })

  it('drops a malformed note rather than refusing to open the drawing', () => {
    const parsed = parseComments([
      note(),
      { id: 'c2', body: 'no coordinates' },
      { id: '', body: 'no id' },
      { id: 'c3', x: 1, y: 2, body: '' },
      'not an object',
    ])
    expect(parsed.map(c => c.id)).toEqual(['c1'])
  })
})

describe('the store', () => {
  it('adds a note and counts it as open', () => {
    const id = useCommentsStore.getState().addComment({
      id: 'c9',
      x: 12,
      y: 24,
      body: '  Customer wants the steps moved.  ',
      authorId: 'user-1',
      authorName: 'Dana Reyes',
      createdAt: AT,
    })
    const stored = useCommentsStore.getState().comments
    expect(id).toBe('c9')
    expect(stored).toHaveLength(1)
    // Trimmed on the way in, so a stray newline does not become a blank line
    // on the pin.
    expect(stored[0]?.body).toBe('Customer wants the steps moved.')
    expect(unresolvedCount(stored)).toBe(1)
  })

  it('resolves and reopens, keeping who did it', () => {
    useCommentsStore.getState().hydrate([note()])
    useCommentsStore.getState().setResolved('c1', true, 'Ray Ortiz', AT)
    expect(useCommentsStore.getState().comments[0]?.resolved).toBe(true)
    expect(useCommentsStore.getState().comments[0]?.resolvedByName).toBe('Ray Ortiz')
    expect(unresolvedCount(useCommentsStore.getState().comments)).toBe(0)

    useCommentsStore.getState().setResolved('c1', false, 'Ray Ortiz', AT)
    const reopened = useCommentsStore.getState().comments[0]
    expect(reopened?.resolved).toBe(false)
    // Cleared rather than left behind: a note showing "resolved by Ray" while
    // sitting in the open list is the app contradicting itself.
    expect(reopened?.resolvedByName).toBeUndefined()
    expect(reopened?.resolvedAt).toBeUndefined()
  })

  it('knows whether a note is there, which is what stops a silent no-op', () => {
    useCommentsStore.getState().hydrate([note()])
    expect(useCommentsStore.getState().has('c1')).toBe(true)
    expect(useCommentsStore.getState().has('c-gone')).toBe(false)
  })
})

describe('undo reaches the notes', () => {
  it('puts back a note that was deleted', () => {
    useCommentsStore.getState().hydrate([note()])
    useCommentsStore.getState().removeComment('c1')
    expect(useCommentsStore.getState().comments).toHaveLength(0)

    useHistoryStore.getState().undo()
    expect(useCommentsStore.getState().comments.map(c => c.id)).toEqual(['c1'])

    useHistoryStore.getState().redo()
    expect(useCommentsStore.getState().comments).toHaveLength(0)
  })

  it('takes back an edit', () => {
    useCommentsStore.getState().hydrate([note()])
    useCommentsStore.getState().editComment('c1', 'Moved to the meter.', AT)
    expect(useCommentsStore.getState().comments[0]?.body).toBe('Moved to the meter.')

    useHistoryStore.getState().undo()
    expect(useCommentsStore.getState().comments[0]?.body).toBe('Check the gas line clearance.')
  })

  it('does not swallow a note when a shape change is undone', () => {
    // The reason a shape snapshot deliberately carries no notes. Placing a pool,
    // writing a note about it and pressing undo should take back the pool: text
    // somebody typed is not collateral for undoing geometry.
    useShapesStore.getState().addShape('RECTANGLE_POOL' as never, 0, 0)
    useCommentsStore.getState().addComment({
      id: 'c5',
      x: 0,
      y: 0,
      body: 'Check the gas line clearance.',
      authorId: 'user-1',
      authorName: 'Dana Reyes',
      createdAt: AT,
    })

    // Undo the note, then undo the pool.
    useHistoryStore.getState().undo()
    expect(useCommentsStore.getState().comments).toHaveLength(0)
    useHistoryStore.getState().undo()
    expect(useShapesStore.getState().shapes).toHaveLength(0)
  })
})

describe('how a note reads', () => {
  it('shows open notes first, newest first inside each group', () => {
    const ordered = sortedForList([
      note({ id: 'old-open', createdAt: '2026-08-01T00:00:00.000Z' }),
      note({ id: 'done', resolved: true, createdAt: '2026-08-19T00:00:00.000Z' }),
      note({ id: 'new-open', createdAt: '2026-08-18T00:00:00.000Z' }),
    ])
    expect(ordered.map(c => c.id)).toEqual(['new-open', 'old-open', 'done'])
  })

  it('initials a name for the pin', () => {
    expect(commentInitials('Dana Reyes')).toBe('DR')
    expect(commentInitials('demo@poolforge.test')).toBe('DP')
    expect(commentInitials('')).toBe('?')
  })

  it('says when, in the words a person uses', () => {
    const now = new Date('2026-08-19T12:00:00.000Z')
    expect(relativeTime('2026-08-19T11:59:50.000Z', now)).toBe('just now')
    expect(relativeTime('2026-08-19T11:30:00.000Z', now)).toBe('30m ago')
    expect(relativeTime('2026-08-19T06:00:00.000Z', now)).toBe('6h ago')
    expect(relativeTime('2026-08-17T12:00:00.000Z', now)).toBe('2d ago')
    expect(relativeTime('not a date', now)).toBe('')
  })
})
