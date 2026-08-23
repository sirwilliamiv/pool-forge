'use client'

import { useParams } from 'next/navigation'
import { useEffect } from 'react'

import { dispatch } from '@/lib/commands/dispatch'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'

import { HOTKEYS, type Hotkey } from './index'

// The listener that makes the shortcut table real.
//
// It was written and never read. Nothing in the app imported HOTKEYS, so every
// keyboard shortcut in the product did nothing: no undo, no delete, no view
// switch, no tool. A builder who deleted the wrong pool had no way back, because
// the one shortcut everybody reaches for was never bound.

/** Fields where a keystroke belongs to the user's typing, not to the editor. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * The shortcut string for an event, in the table's own spelling.
 *
 * 'mod' rather than naming a platform, so one entry covers Cmd and Ctrl. Order
 * is fixed at mod, then shift, then the key, because a lookup is only as good
 * as both sides agreeing on how to spell it.
 */
export function shortcutFor(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('mod')
  if (event.shiftKey) parts.push('shift')

  const key = event.key
  const named =
    key === ' '
      ? 'space'
      : key === 'Escape'
        ? 'escape'
        : key === 'Delete'
          ? 'delete'
          : key === 'Backspace'
            ? 'backspace'
            : key.toLowerCase()

  parts.push(named)
  return parts.join('+')
}

/**
 * The input a shortcut sends, or null when there is nothing to send it about.
 *
 * Null is an ordinary answer: Delete with an empty canvas has nothing to
 * delete. It is not an error and must not reach the command, which would
 * report a validation failure at a user who did nothing wrong.
 */
export function inputFor(
  hotkey: Hotkey,
  context: { selectedIds: string[]; projectId?: string | undefined },
): Record<string, unknown> | null {
  if (hotkey.fromSelection === 'ids') {
    return context.selectedIds.length > 0 ? { ids: context.selectedIds } : null
  }
  if (hotkey.fromSelection === 'id') {
    // One shape, because duplicate takes one. The first selected is the one the
    // user reached for first.
    const first = context.selectedIds[0]
    return first ? { id: first } : null
  }
  if (hotkey.needsProject) {
    return context.projectId ? { projectId: context.projectId } : null
  }
  return (hotkey.input as Record<string, unknown> | undefined) ?? {}
}

export function useHotkeys(enabled = true): void {
  const params = useParams<{ id?: string }>()
  const projectId = typeof params?.id === 'string' ? params.id : undefined

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent) {
      // Never steal a keystroke from a field. Cmd+Z in a text box is the
      // browser's undo and belongs to the text, not to the drawing.
      if (isTyping(event.target)) return

      const shortcut = shortcutFor(event)
      const hotkey = HOTKEYS.find(entry => entry.shortcut === shortcut)
      if (!hotkey) return

      // Only once a shortcut is known to be ours, so an unbound key still does
      // whatever the browser would normally do with it. Backspace in
      // particular navigates back in some browsers, which on a drawing is
      // worse than the delete the user asked for.
      event.preventDefault()

      const input = inputFor(hotkey, {
        selectedIds: useSelectionStore.getState().selectedIds,
        projectId,
      })
      if (!input) return

      void dispatch(hotkey.commandId, input)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, projectId])
}
