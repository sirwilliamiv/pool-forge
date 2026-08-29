'use client'

import { create } from 'zustand'

import { COMMENT_BODY_MAX, type DrawingComment } from '../comments/model'
import { useHistoryStore } from './historyStore'

// The notes pinned to this drawing, as editable state.
//
// Shaped after `gradeStore`: the drawing's non-shape state lives in its own
// store, is hydrated from `Drawing.rootJson` on open, is subscribed to by
// `EditorPersistence` so a change is written, and is reachable by undo.
//
// `draft` and `openId` are on the same store but are deliberately not part of
// what gets saved: the persistence layer subscribes on `comments` alone, so
// opening a pin does not touch the database.

export interface CommentDraft {
  /** Inches from the drawing origin, where the pin will land. */
  x: number
  y: number
}

export interface AddCommentInput {
  id: string
  x: number
  y: number
  body: string
  authorId: string
  authorName: string
  createdAt: string
}

export interface CommentsState {
  comments: DrawingComment[]
  /** A pin being written, before it exists. Escape throws this away. */
  draft: CommentDraft | null
  /** The pin whose card is open, if any. */
  openId: string | null

  hydrate: (comments: DrawingComment[]) => void
  beginDraft: (at: CommentDraft) => void
  cancelDraft: () => void
  setOpen: (id: string | null) => void

  addComment: (input: AddCommentInput) => string
  editComment: (id: string, body: string, at: string) => void
  removeComment: (id: string) => void
  setResolved: (id: string, resolved: boolean, byName: string, at: string) => void

  /** True when this drawing has a note with that id. */
  has: (id: string) => boolean

  /** Replace without pushing history, for load and undo. */
  _replaceComments: (comments: DrawingComment[]) => void
}

/**
 * Record the whole drawing before a change, so undo can put it back.
 *
 * Shapes and grade are read through the history store's accessors rather than
 * imported, so this store depends on neither. Same reason gradeStore does it
 * this way.
 */
function pushHistory(comments: DrawingComment[]): void {
  const history = useHistoryStore.getState()
  const shapes = history._getShapes?.() ?? []
  const grade = history._getGrade?.()
  history.pushPast(grade ? { shapes, grade, comments } : { shapes, comments })
}

export const useCommentsStore = create<CommentsState>()((set, get) => ({
  comments: [],
  draft: null,
  openId: null,

  hydrate: (comments) => set({ comments, draft: null, openId: null }),

  beginDraft: (at) => set({ draft: at, openId: null }),
  cancelDraft: () => set({ draft: null }),
  setOpen: (openId) => set({ openId }),

  addComment: (input) => {
    const body = input.body.trim().slice(0, COMMENT_BODY_MAX)
    const comment: DrawingComment = {
      id: input.id,
      x: input.x,
      y: input.y,
      body,
      authorId: input.authorId,
      authorName: input.authorName,
      createdAt: input.createdAt,
      resolved: false,
    }
    set((state) => {
      pushHistory(state.comments)
      return { comments: [...state.comments, comment], draft: null }
    })
    return comment.id
  },

  editComment: (id, body, at) =>
    set((state) => {
      pushHistory(state.comments)
      const trimmed = body.trim().slice(0, COMMENT_BODY_MAX)
      return {
        comments: state.comments.map((comment) =>
          comment.id === id ? { ...comment, body: trimmed, updatedAt: at } : comment,
        ),
      }
    }),

  removeComment: (id) =>
    set((state) => {
      pushHistory(state.comments)
      return {
        comments: state.comments.filter((comment) => comment.id !== id),
        openId: state.openId === id ? null : state.openId,
      }
    }),

  setResolved: (id, resolved, byName, at) =>
    set((state) => {
      pushHistory(state.comments)
      return {
        comments: state.comments.map((comment) => {
          if (comment.id !== id) return comment
          // Field by field rather than a spread of optionals: with
          // `exactOptionalPropertyTypes` on, writing `resolvedAt: undefined`
          // is not the same as leaving it out.
          const next: DrawingComment = {
            id: comment.id,
            x: comment.x,
            y: comment.y,
            body: comment.body,
            authorId: comment.authorId,
            authorName: comment.authorName,
            createdAt: comment.createdAt,
            resolved,
          }
          if (comment.updatedAt) next.updatedAt = comment.updatedAt
          if (resolved) {
            next.resolvedAt = at
            next.resolvedByName = byName
          }
          return next
        }),
      }
    }),

  has: (id) => get().comments.some((comment) => comment.id === id),

  _replaceComments: (comments) =>
    set((state) => ({
      comments,
      openId: comments.some((comment) => comment.id === state.openId) ? state.openId : null,
    })),
}))

// Let undo reach the notes, the same way gradeStore does for the ground. Bound
// here rather than imported the other way so neither store depends on the other.
useHistoryStore
  .getState()
  .bindCommentsAccessor(
    () => useCommentsStore.getState().comments,
    (comments) => useCommentsStore.getState()._replaceComments(comments),
  )
