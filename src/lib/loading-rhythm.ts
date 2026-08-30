'use client'

/**
 * The loading screen's sense of rhythm.
 *
 * A loading screen that flashes for eighty milliseconds feels like a glitch,
 * and one that shows for eighty milliseconds on one navigation and two seconds
 * on the next feels like two different apps. So once the screen has appeared
 * it stays up for a minimum, and every navigation that shows it gets the same
 * beat.
 */

export const LOADING_MIN_MS = 500

/** How much longer the screen owes, given when it appeared. */
export function holdRemaining(shownAtMs: number | null, nowMs: number): number {
  if (shownAtMs === null) return 0
  return Math.max(0, LOADING_MIN_MS - (nowMs - shownAtMs))
}
