'use client'

import { useEffect } from 'react'

import { SPECTRUM } from '@/lib/brand'

/**
 * The favicon is the wordmark's first O: a pool with a parasol on its
 * shoulder, sitting beside the words "Pool Forge" in the tab.
 *
 * A tab title is plain text the browser controls, so the O in it cannot carry
 * colour; the favicon is the only pixel surface a tab has, and this makes it
 * the O. The pool's coping is the letter stroke, the water steps through the
 * five core hues on the loading pool's 6s clock, and the parasol turns at
 * breeze speed with its self-shaded canopy one hue step behind the water, the
 * same offset the sign-in wordmark keeps, so no surface ever shows the pair
 * matching.
 *
 * Browsers do not animate SVG favicons (only Firefox does), so frames are
 * drawn to a canvas and swapped into the icon link as data URLs. Eight frames
 * a second is plenty for a 16px icon; background tabs throttle timers to once
 * a second, so an inactive tab's parasol turns lazily, which suits a parasol.
 * Reduced motion draws one still frame on brand blue and stops.
 */

const HUES = [SPECTRUM.blue, SPECTRUM.green, SPECTRUM.orange, SPECTRUM.red, SPECTRUM.purple]
const HUE_STEP_MS = 1_200
const TURN_MS = 9_000
const FRAME_MS = 125
const SIZE = 64

/** The darker cut of a hue, same 22% toward black as the CSS parasols. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const cut = (v: number) => Math.round(v * 0.78)
  return `rgb(${cut(n >> 16)} ${cut((n >> 8) & 0xff)} ${cut(n & 0xff)})`
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  waterHue: string,
  parasolHue: string,
  angle: number,
): void {
  ctx.clearRect(0, 0, SIZE, SIZE)

  // The O: coping stroke and water, drawn low-left so the parasol has a
  // shoulder to crop onto.
  const ox = 29
  const oy = 36
  const or = 24
  ctx.beginPath()
  ctx.arc(ox, oy, or, 0, Math.PI * 2)
  ctx.fillStyle = waterHue
  ctx.fill()
  ctx.lineWidth = 7
  ctx.strokeStyle = '#000000'
  ctx.stroke()

  // The parasol on the top-right shoulder.
  const px = 48
  const py = 15
  const pr = 14
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(angle)
  const dark = shade(parasolHue)
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, pr, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4)
    ctx.closePath()
    ctx.fillStyle = i % 2 === 0 ? parasolHue : dark
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(0, 0, pr * 0.16, 0, Math.PI * 2)
  ctx.fillStyle = 'rgb(0 0 0 / 0.72)'
  ctx.fill()
  ctx.restore()
}

export function WordmarkFavicon() {
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const link = existing ?? document.createElement('link')
    if (!existing) {
      link.rel = 'icon'
      document.head.appendChild(link)
    }

    const paint = (now: number) => {
      const step = Math.floor(now / HUE_STEP_MS)
      const parasolHue = HUES[step % HUES.length] ?? SPECTRUM.blue
      // The water runs one step ahead, like the wordmark, so they never match.
      const waterHue = HUES[(step + 1) % HUES.length] ?? SPECTRUM.green
      const angle = ((now % TURN_MS) / TURN_MS) * Math.PI * 2
      drawMark(ctx, waterHue, parasolHue, angle)
      try {
        link.href = canvas.toDataURL('image/png')
      } catch {
        // A canvas that cannot serialise (odd embedder policies) just leaves
        // whatever icon was there; the favicon is decoration, never a failure.
      }
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawMark(ctx, SPECTRUM.blue, SPECTRUM.blue, 0)
      try {
        link.href = canvas.toDataURL('image/png')
      } catch {}
      return
    }

    paint(0)
    const timer = window.setInterval(() => paint(Date.now()), FRAME_MS)
    return () => window.clearInterval(timer)
  }, [])

  return null
}
