'use client'

import { CommentCard } from '@/components/editor/comments/CommentCard'
import { sortedForList, unresolvedCount } from '@/modules/editor/comments/model'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'

/**
 * Every note on this drawing, in one list.
 *
 * The pins are where a note belongs; this is how a note gets found. A pin on
 * the far side of a lot, or behind the camera, is invisible until somebody
 * happens to orbit past it, and "there is a note somewhere on this job" is not
 * something a builder should have to go hunting for.
 */
export function CommentsPanel() {
  const comments = useCommentsStore((s) => s.comments)
  const openId = useCommentsStore((s) => s.openId)
  const setOpen = useCommentsStore((s) => s.setOpen)

  const ordered = sortedForList(comments)
  const open = unresolvedCount(comments)

  if (ordered.length === 0) {
    return (
      <div className="px-3 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
          Notes
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-textFaint">
          No notes on this drawing yet. Press <kbd className="rounded-pfXs bg-rowHover px-1">C</kbd>{' '}
          and click the drawing to leave one. Notes are internal: they never appear on the proposal,
          the site plan or the construction packet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between px-3 pb-1.5 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
          Notes
        </span>
        <span className="text-[10.5px] text-textFaint">
          {open} open · {ordered.length - open} resolved
        </span>
      </div>
      <ul>
        {ordered.map((comment) => (
          <li
            key={comment.id}
            className={
              'border-t border-borderLight px-3 py-2.5 ' +
              (openId === comment.id ? 'bg-pfAccentSoft' : '')
            }
          >
            <button
              type="button"
              onClick={() => setOpen(openId === comment.id ? null : comment.id)}
              className="mb-1 text-[10.5px] text-pfAccent hover:underline"
            >
              {openId === comment.id ? 'Hide on drawing' : 'Show on drawing'}
            </button>
            <CommentCard comment={comment} />
          </li>
        ))}
      </ul>
    </div>
  )
}
