'use client'

import { Redo2, Undo2 } from 'lucide-react'

import { dispatch } from '@/lib/commands/dispatch'
import { useHistoryStore } from '@/modules/editor/state/historyStore'

// Somewhere to click to take it back.
//
// The store has recorded every change from the beginning and `edit.undo` has
// worked for as long as it has existed, but nothing in the browser could reach
// either: no button anywhere, and nothing imported the shortcut table, so
// Cmd+Z did nothing. A builder who deleted the wrong pool lost it.

export function UndoRedo() {
  // Subscribed to the stacks rather than calling canUndo() once, so the buttons
  // enable the moment there is something to undo instead of on the next render
  // that happens to occur.
  const canUndo = useHistoryStore(state => state.past.length > 0)
  const canRedo = useHistoryStore(state => state.future.length > 0)

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => void dispatch('edit.undo', {})}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
        className="grid h-7 w-7 place-items-center rounded-pfSm text-textMuted transition hover:bg-rowHover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-pfAccent"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => void dispatch('edit.redo', {})}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
        className="grid h-7 w-7 place-items-center rounded-pfSm text-textMuted transition hover:bg-rowHover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-pfAccent"
      >
        <Redo2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}
