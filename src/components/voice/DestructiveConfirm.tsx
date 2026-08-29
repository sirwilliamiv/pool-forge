'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'

// The dialog voice has to get through before it destroys anything.
//
// The spoken confirmation is a good gate and not a sufficient one: it is the
// agent deciding the user agreed, from audio it may have misheard. This is the
// user themselves saying yes, with the thing that will be lost written down in
// front of them.
//
// It exists because the alternative already failed. Asked to delete a project,
// a model wrote its own `confirm: true` into the call and deleted it on a single
// sentence, having never told anyone what was about to go.

export interface DestructiveRequest {
  /** What the agent is about to run, in the user's words. */
  summary: string
  /** The command id, shown small, so a report of this is unambiguous. */
  commandId: string
}

export interface DestructiveConfirmProps {
  request: DestructiveRequest | null
  onDecide: (allowed: boolean) => void
}

export function DestructiveConfirm({ request, onDecide }: DestructiveConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Cancel takes focus, not the confirm. A dialog that appears mid-sentence with
  // the destructive button focused turns an idle keypress into a deletion.
  useEffect(() => {
    if (request) cancelRef.current?.focus()
  }, [request])

  useEffect(() => {
    if (!request) return
    const onKey = (event: KeyboardEvent) => {
      // Escape cancels. There is deliberately no keyboard shortcut to confirm.
      if (event.key === 'Escape') onDecide(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [request, onDecide])

  if (!request) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-confirm-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="voice-confirm-title" className="text-sm font-semibold text-slate-900">
              Voice wants to remove something
            </h2>
            {/* The sentence names what goes, because "are you sure?" is a
                question nobody can answer. */}
            <p className="mt-1 text-sm text-slate-700">{request.summary}</p>
            <p className="mt-2 font-mono text-[11px] text-slate-400">{request.commandId}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onDecide(false)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onDecide(true)}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
