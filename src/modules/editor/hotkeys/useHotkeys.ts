'use client'

import { useEffect } from 'react'

import { dispatch } from '@/lib/commands/dispatch'

import { HOTKEYS } from './index'

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

export function useHotkeys(enabled = true): void {
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
      // whatever the browser would normally do with it.
      event.preventDefault()
      void dispatch(hotkey.commandId, hotkey.input ?? {})
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
