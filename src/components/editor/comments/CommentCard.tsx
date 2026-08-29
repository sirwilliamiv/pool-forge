'use client'

import { useState } from 'react'
import { Check, Pencil, Trash2, Undo2, X } from 'lucide-react'

import { COMMENT_BODY_MAX, commentInitials, relativeTime, type DrawingComment } from '@/modules/editor/comments/model'
import { editComment, removeComment, resolveComment } from './actions'

interface Props {
  comment: DrawingComment
  /** Shown when the card is a pin's popover; the list has no close button. */
  onClose?: (() => void) | undefined
}

/**
 * One note, with everything that can be done to it.
 *
 * Shared by the pin on the canvas and the row in the list, so the two cannot
 * offer different actions or disagree about what a resolved note looks like.
 */
export function CommentCard({ comment, onClose }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [busy, setBusy] = useState(false)

  async function commitEdit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === comment.body) {
      setEditing(false)
      setDraft(comment.body)
      return
    }
    setBusy(true)
    const ok = await editComment(comment.id, trimmed)
    setBusy(false)
    if (ok) setEditing(false)
  }

  async function toggleResolved() {
    setBusy(true)
    await resolveComment(comment.id, !comment.resolved)
    setBusy(false)
  }

  async function destroy() {
    setBusy(true)
    await removeComment(comment.id)
    setBusy(false)
  }

  return (
    <div className="w-full text-left" data-comment-card>
      <div className="flex items-start gap-2">
        <span
          className={
            'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-white ' +
            (comment.resolved ? 'bg-emerald-600' : 'bg-amber-500')
          }
          aria-hidden
        >
          {commentInitials(comment.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[11.5px] font-semibold text-foreground">
              {comment.authorName}
            </span>
            <span className="shrink-0 text-[10.5px] text-textFaint">
              {relativeTime(comment.createdAt)}
              {comment.updatedAt ? ' · edited' : ''}
            </span>
          </div>

          {editing ? (
            <textarea
              value={draft}
              maxLength={COMMENT_BODY_MAX}
              aria-label="Edit note"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  setEditing(false)
                  setDraft(comment.body)
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void commitEdit()
                }
              }}
              className="mt-1 h-16 w-full resize-none rounded-pfSm border border-borderLight px-2 py-1 text-[12px] leading-snug focus:border-pfAccent focus:outline-none focus:ring-1 focus:ring-pfAccent"
            />
          ) : (
            <p
              className={
                'mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-snug ' +
                (comment.resolved ? 'text-textMuted line-through' : 'text-foreground')
              }
            >
              {comment.body}
            </p>
          )}

          {comment.resolved && comment.resolvedByName ? (
            <div className="mt-1 text-[10.5px] text-emerald-700">
              Resolved by {comment.resolvedByName}
              {comment.resolvedAt ? ` · ${relativeTime(comment.resolvedAt)}` : ''}
            </div>
          ) : null}
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close note"
            className="grid h-5 w-5 shrink-0 place-items-center rounded-pfXs text-textFaint hover:bg-rowHover hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-1">
        {editing ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void commitEdit()}
              className="h-6 rounded-pfSm bg-pfAccent px-2 text-[11px] font-medium text-white hover:bg-pfAccentStrong disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft(comment.body)
              }}
              className="h-6 rounded-pfSm px-2 text-[11px] text-textMuted hover:bg-rowHover"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleResolved()}
              aria-label={comment.resolved ? 'Reopen note' : 'Resolve note'}
              className="inline-flex h-6 items-center gap-1 rounded-pfSm px-1.5 text-[11px] text-textMuted hover:bg-rowHover hover:text-foreground disabled:opacity-50"
            >
              {comment.resolved ? <Undo2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {comment.resolved ? 'Reopen' : 'Resolve'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              aria-label="Edit note"
              className="inline-flex h-6 items-center gap-1 rounded-pfSm px-1.5 text-[11px] text-textMuted hover:bg-rowHover hover:text-foreground disabled:opacity-50"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <div className="flex-1" />
            <button
              type="button"
              disabled={busy}
              onClick={() => void destroy()}
              aria-label="Delete note"
              className="inline-flex h-6 items-center gap-1 rounded-pfSm px-1.5 text-[11px] text-textMuted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
