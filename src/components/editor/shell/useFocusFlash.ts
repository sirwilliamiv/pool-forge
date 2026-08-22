'use client'

import { useEffect, useState } from 'react'

import { useViewStore, type FocusTarget } from '@/modules/editor/state/viewStore'

// "Show me the quote" has to be visible. Switching to a tab that was already
// open looks like nothing happened, so the panel flashes for a moment.

const FLASH_MS = 1_400

/**
 * True while this panel is the one that was just asked for.
 *
 * Keyed on the nonce rather than the target so asking twice flashes twice: the
 * target has not changed the second time, and without the nonce React sees no
 * state change at all.
 */
export function useFocusFlash(target: FocusTarget): boolean {
  const focusedPanel = useViewStore(state => state.focusedPanel)
  const focusNonce = useViewStore(state => state.focusNonce)
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (focusedPanel !== target || focusNonce === 0) return
    setFlashing(true)
    const timer = setTimeout(() => setFlashing(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [focusedPanel, focusNonce, target])

  return flashing
}

/** Ring classes for a flashing panel, or nothing. */
export function focusRing(flashing: boolean): string {
  return flashing ? 'ring-2 ring-sky-500 ring-offset-1 ring-offset-white' : ''
}
