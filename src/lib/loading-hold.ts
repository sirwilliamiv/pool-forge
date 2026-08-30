'use client'

import { holdRemaining } from './loading-rhythm'

/**
 * How the loading pool keeps its minimum on screen.
 *
 * React unmounts a Suspense fallback the instant the page is ready, which is
 * exactly the flash the minimum-shown rule exists to prevent, and a route
 * template cannot help because it sits above the loading boundary. So the
 * fallback settles its own debt in plain DOM: on unmount, if the pool has not
 * been up for its minimum, its rendered markup is cloned into a fixed overlay
 * that stays for the remainder and then fades over the brand's 0.2s.
 *
 * The clone's CSS animations are re-phased with a negative delay so the water
 * is on the same hue and the ripple mid-ring: without that the pool visibly
 * snaps back to its first frame at the moment of the handoff.
 */

const FADE_MS = 200

let shownAt = 0
let overlay: HTMLElement | null = null
let timers: number[] = []

function cancelTimers(): void {
  for (const timer of timers) window.clearTimeout(timer)
  timers = []
}

/** Called when a loading fallback mounts. Starts the clock, clears any holdover. */
export function markLoadingMounted(): void {
  cancelTimers()
  // A live fallback is on screen again; the previous holdover has done its job.
  overlay?.remove()
  overlay = null
  shownAt = Date.now()
}

/** Re-phase every CSS animation on the clone to match the original's clock. */
function syncAnimationPhase(original: HTMLElement, clone: HTMLElement, elapsedS: number): void {
  const sources = [original, ...original.querySelectorAll<HTMLElement>('*')]
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    const copy = copies[i]
    if (!source || !copy) continue
    const style = window.getComputedStyle(source)
    if (style.animationName === 'none' || style.animationName === '') continue
    copy.style.animationDelay = style.animationDelay
      .split(',')
      .map(delay => `calc(${delay.trim() || '0s'} - ${elapsedS}s)`)
      .join(', ')
  }
}

/** Called from the fallback's unmount with its rendered root. */
export function holdLoadingFrom(el: HTMLElement | null): void {
  if (!el) return
  const now = Date.now()
  const hold = holdRemaining(shownAt, now)
  if (hold <= 0) return

  const rect = el.getBoundingClientRect()
  const clone = el.cloneNode(true) as HTMLElement
  syncAnimationPhase(el, clone, (now - shownAt) / 1000)
  clone.style.position = 'absolute'
  clone.style.left = `${rect.left}px`
  clone.style.top = `${rect.top}px`
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.margin = '0'

  const shell = document.createElement('div')
  shell.setAttribute('data-loading-hold', 'shown')
  shell.setAttribute('aria-hidden', 'true')
  shell.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:70', 'pointer-events:none',
    'background:var(--theme-bg, #FFFFFF)', 'opacity:1',
    `transition:opacity ${FADE_MS / 1000}s ease-out`,
  ].join(';')
  shell.appendChild(clone)
  document.body.appendChild(shell)
  overlay = shell

  timers.push(
    window.setTimeout(() => {
      if (!overlay) return
      overlay.setAttribute('data-loading-hold', 'leaving')
      overlay.style.opacity = '0'
      timers.push(
        window.setTimeout(() => {
          overlay?.remove()
          overlay = null
        }, FADE_MS + 20),
      )
    }, hold),
  )
}
