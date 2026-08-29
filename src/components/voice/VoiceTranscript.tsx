'use client'

import { useEffect, useRef } from 'react'

import type { TranscriptLine } from '@/modules/voice/client/useVoiceSession'

/**
 * What was said, over the drawing, without taking any of it.
 *
 * No panel. The editor is the product and the canvas is the part of it that
 * matters, so the transcript is text on top of the drawing rather than a card
 * sitting on the drawing. That means three things have to be true at once.
 *
 * It cannot be clicked. `pointer-events: none` all the way down, so a line of
 * speech lying over a pool is not a dead patch of canvas: every click goes
 * through it to the thing underneath.
 *
 * It has to stay readable over anything. There is no background to guarantee
 * contrast, and the canvas underneath ranges from near-white deck to dark water,
 * so each line carries its own light halo. A shadow rather than a box: it holds
 * the letters up without claiming a rectangle.
 *
 * And it has to leave. Lines rise as new ones arrive and dissolve into nothing
 * at the top, which is what a mask does and what a scroll bar cannot: an
 * overflow container would either clip mid-word or grow a scrollbar, and both
 * read as a panel again.
 */
export function VoiceTranscript({ lines }: { lines: TranscriptLine[] }) {
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    // Follow the talking. Instant rather than smooth, because speech arrives in
    // fragments and an animated scroll per fragment jitters.
    rail.scrollTop = rail.scrollHeight
  }, [lines])

  if (lines.length === 0) return null

  return (
    <div
      ref={railRef}
      aria-live="polite"
      // Never interactive, and never in the way. This is the whole point of the
      // component: reading it must never cost a click.
      className="pointer-events-none max-h-[15rem] w-[22rem] select-none overflow-hidden text-[13.5px] leading-snug"
      style={{
        // Dissolves upward. Doubled for WebKit, which still wants the prefix.
        maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.25) 12%, #000 38%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.25) 12%, #000 38%)',
      }}
    >
      <div className="flex flex-col items-end gap-1 text-right">
        {lines.map(line => (
          <p
            key={line.id}
            className={
              line.role === 'user'
                ? 'font-semibold text-slate-900'
                : 'font-medium text-slate-600'
            }
            style={{
              // The halo. Four offsets rather than a blur, so thin strokes stay
              // crisp against the grid instead of going soft.
              textShadow:
                '0 1px 2px rgba(255,255,255,.95), 0 -1px 2px rgba(255,255,255,.95), 1px 0 2px rgba(255,255,255,.95), -1px 0 2px rgba(255,255,255,.95)',
            }}
          >
            {line.text}
          </p>
        ))}
      </div>
    </div>
  )
}
