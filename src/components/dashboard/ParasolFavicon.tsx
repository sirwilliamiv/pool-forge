'use client'

import { useEffect } from 'react'

import { SPECTRUM } from '@/lib/brand'

/**
 * The favicon is the parasol.
 *
 * The same piece of furniture as the sign-in wordmark and the loading pool:
 * eight self-shaded canopy panels turning at breeze speed while the hue steps
 * through the five core hues on the 6s clock. Browsers do not animate SVG
 * favicons (only Firefox does), so this draws frames to a canvas and swaps the
 * icon link's data URL, which works everywhere.
 *
 * Eight frames a second is plenty for a 16px icon and costs nothing
 * measurable. Background tabs throttle timers to once a second, so an inactive
 * tab's parasol turns lazily rather than smoothly, which suits a parasol.
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

function drawParasol(ctx: CanvasRenderingContext2D, hue: string, angle: number): void {
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.save()
  ctx.translate(SIZE / 2, SIZE / 2)
  ctx.rotate(angle)
  const r = SIZE / 2
  const dark = shade(hue)
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, r, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4)
    ctx.closePath()
    ctx.fillStyle = i % 2 === 0 ? hue : dark
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2)
  ctx.fillStyle = 'rgb(0 0 0 / 0.72)'
  ctx.fill()
  ctx.restore()
}

export function ParasolFavicon() {
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
      const hue = HUES[Math.floor(now / HUE_STEP_MS) % HUES.length] ?? SPECTRUM.blue
      const angle = ((now % TURN_MS) / TURN_MS) * Math.PI * 2
      drawParasol(ctx, hue, angle)
      try {
        link.href = canvas.toDataURL('image/png')
      } catch {
        // A canvas that cannot serialise (odd embedder policies) just leaves
        // whatever icon was there; the favicon is decoration, never a failure.
      }
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawParasol(ctx, SPECTRUM.blue, 0)
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
