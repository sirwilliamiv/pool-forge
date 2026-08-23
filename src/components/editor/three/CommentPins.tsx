'use client'

import { Html } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'

import { CommentCard } from '@/components/editor/comments/CommentCard'
import { addComment } from '@/components/editor/comments/actions'
import { feet } from '@/lib/three/units'
import { COMMENT_BODY_MAX, commentInitials, type DrawingComment } from '@/modules/editor/comments/model'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useViewStore } from '@/modules/editor/state/viewStore'

// The notes, on the drawing.
//
// Mounted inside <Canvas> so each pin is anchored to the ground point it was
// dropped on and travels with the camera. Drei's <Html> is a DOM portal at a 3D
// position, which is what makes the pin legible at any zoom and clickable
// without a raycast: the click lands on a div, not on the canvas, so the tool
// gestures never see it.
//
// Pins sit slightly above the ground plane so they are not z-fighting the deck.
const PIN_HEIGHT = 0.2

export function CommentPins() {
  const comments = useCommentsStore((s) => s.comments)
  const draft = useCommentsStore((s) => s.draft)
  const openId = useCommentsStore((s) => s.openId)
  const setOpen = useCommentsStore((s) => s.setOpen)
  // A note is an internal working note. Customer presentation mode is the one
  // where somebody is looking at this screen over the builder's shoulder.
  const presenting = useViewStore((s) => s.presentationMode) === 'customer'

  // Escape closes the open card, the way it cancels everything else on this
  // canvas. Without it the only way out of a card is the small X, and the card
  // sits over the drawing.
  useEffect(() => {
    if (!openId) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, setOpen])

  if (presenting) return null

  return (
    <>
      {comments.map((comment) => (
        <CommentPin key={comment.id} comment={comment} open={openId === comment.id} />
      ))}
      {draft ? <CommentComposer x={draft.x} y={draft.y} /> : null}
    </>
  )
}

function CommentPin({ comment, open }: { comment: DrawingComment; open: boolean }) {
  const setOpen = useCommentsStore((s) => s.setOpen)

  return (
    <Html
      position={[feet(comment.x), PIN_HEIGHT, feet(comment.y)]}
      center
      zIndexRange={[40, 0]}
      // Nothing else in the scene should be reachable through the pin's box.
      style={{ pointerEvents: 'none' }}
    >
      <div className="pointer-events-none relative">
        <button
          type="button"
          onClick={() => setOpen(open ? null : comment.id)}
          title={comment.body}
          aria-label={`Note from ${comment.authorName}`}
          aria-expanded={open}
          className={
            'pointer-events-auto grid h-6 w-6 place-items-center rounded-full rounded-bl-none border-2 border-white text-[9px] font-semibold text-white shadow-pfMd transition hover:scale-110 ' +
            (comment.resolved ? 'bg-emerald-600/70' : 'bg-amber-500')
          }
        >
          {commentInitials(comment.authorName)}
        </button>

        {open ? (
          <div
            className="pointer-events-auto absolute left-4 top-4 w-[248px] rounded-pfMd border border-borderLight bg-white p-2.5 shadow-pfLg"
            role="dialog"
            aria-label="Note"
          >
            <CommentCard comment={comment} onClose={() => setOpen(null)} />
          </div>
        ) : null}
      </div>
    </Html>
  )
}

/**
 * The pin being written, before it exists.
 *
 * Nothing is created until there is something to create: Escape, a click
 * outside, or an empty save all leave the drawing exactly as it was. An empty
 * pin on the canvas would be worse than no pin, because somebody would have to
 * open it to find out it says nothing.
 */
function CommentComposer({ x, y }: { x: number; y: number }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelDraft = useCommentsStore((s) => s.cancelDraft)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textRef.current?.focus()
  }, [])

  function cancel() {
    cancelDraft()
    // Back to the select tool, so the next click opens a pin rather than
    // dropping a second note on top of the first.
    setActiveTool('tool.select')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      cancelDraft()
      setActiveTool('tool.select')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelDraft, setActiveTool])

  async function commit() {
    const body = text.trim()
    if (!body) {
      cancel()
      return
    }
    setBusy(true)
    const ok = await addComment({ x, y }, body)
    setBusy(false)
    if (ok) {
      // The handler already cleared the draft by adding the note. Only the tool
      // needs putting back.
      setActiveTool('tool.select')
    }
  }

  return (
    <Html position={[feet(x), PIN_HEIGHT, feet(y)]} center zIndexRange={[60, 0]}>
      <div
        className="w-[248px] rounded-pfMd border border-borderLight bg-white p-2.5 shadow-pfLg"
        role="dialog"
        aria-label="New note"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
          New note
        </div>
        <textarea
          ref={textRef}
          value={text}
          maxLength={COMMENT_BODY_MAX}
          aria-label="Note"
          placeholder="Check the gas line clearance…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void commit()
            }
          }}
          className="mt-1.5 h-16 w-full resize-none rounded-pfSm border border-borderLight px-2 py-1 text-[12px] leading-snug focus:border-pfAccent focus:outline-none focus:ring-1 focus:ring-pfAccent"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-[10px] text-textFaint">Internal · never on a customer document</span>
          <button
            type="button"
            onClick={cancel}
            className="h-6 rounded-pfSm px-2 text-[11px] text-textMuted hover:bg-rowHover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || text.trim().length === 0}
            onClick={() => void commit()}
            className="h-6 rounded-pfSm bg-pfAccent px-2.5 text-[11px] font-medium text-white hover:bg-pfAccentStrong disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Html>
  )
}
