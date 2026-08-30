'use client'

import { useEffect } from 'react'

import { INK, SPECTRUM, TINTS } from '@/lib/brand'
import { holdRemaining } from '@/lib/loading-rhythm'

/**
 * The one loading screen, with a sense of rhythm.
 *
 * White ground, the cool-bolds ring, a mono label. The ring is the same
 * blue-aqua-green-purple run as the live-session border and the transcript
 * pills, so waiting looks like the same product as talking.
 *
 * The React component renders nothing. It drives a plain DOM overlay instead,
 * because the component is a Suspense fallback and React unmounts it the
 * instant the page is ready, which is exactly the flash the minimum-shown rule
 * exists to prevent. A route template cannot enforce the minimum either: a
 * template sits above the loading boundary, so it remounts when the fallback
 * appears rather than when the page does. The overlay is the only thing that
 * outlives both, so the overlay keeps the clock: mount shows it and starts the
 * count, unmount asks `holdRemaining` what is still owed, waits it out, then
 * fades over the brand's 0.2s and removes itself. Back-to-back navigations
 * reuse the overlay rather than blinking it.
 */

const OVERLAY_ID = 'pf-route-loading'
const FADE_MS = 200

const RING = `conic-gradient(${SPECTRUM.blue}, ${TINTS.aqua}, ${SPECTRUM.green}, ${SPECTRUM.purple}, ${SPECTRUM.blue})`
const RING_MASK = 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))'

let overlay: HTMLElement | null = null
let shownAt = 0
let timers: number[] = []

function cancelTimers(): void {
  for (const timer of timers) window.clearTimeout(timer)
  timers = []
}

function ensureOverlay(): void {
  if (overlay) {
    // A newer navigation while the screen is still up: keep it, keep the
    // original clock, and cancel any scheduled exit.
    cancelTimers()
    overlay.style.opacity = '1'
    return
  }
  shownAt = Date.now()
  const el = document.createElement('div')
  el.id = OVERLAY_ID
  el.setAttribute('role', 'status')
  el.setAttribute('aria-label', 'Loading')
  el.setAttribute('data-loading-screen', 'shown')
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:70', 'background:#FFFFFF',
    'display:grid', 'place-items:center', 'opacity:1',
    `transition:opacity ${FADE_MS / 1000}s ease-out`,
  ].join(';')
  el.innerHTML =
    `<style>@keyframes pf-loading-spin{to{transform:rotate(360deg)}}` +
    `@media (prefers-reduced-motion: reduce){#${OVERLAY_ID} [data-ring]{animation:none!important}}</style>` +
    `<div style="display:flex;flex-direction:column;align-items:center;gap:12px">` +
    `<div data-ring aria-hidden="true" style="width:36px;height:36px;border-radius:9999px;` +
    `background:${RING};-webkit-mask:${RING_MASK};mask:${RING_MASK};` +
    `animation:pf-loading-spin 1s linear infinite"></div>` +
    `<span style="font-family:var(--font-mono,ui-monospace,monospace);font-size:11px;font-weight:600;` +
    `letter-spacing:.6px;text-transform:uppercase;color:${INK.slate}">Loading</span>` +
    `</div>`
  document.body.appendChild(el)
  overlay = el
}

function releaseOverlay(): void {
  if (!overlay) return
  const hold = holdRemaining(shownAt, Date.now())
  timers.push(
    window.setTimeout(() => {
      if (!overlay) return
      overlay.setAttribute('data-loading-screen', 'leaving')
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

export function LoadingScreen() {
  useEffect(() => {
    ensureOverlay()
    return releaseOverlay
  }, [])

  return null
}
