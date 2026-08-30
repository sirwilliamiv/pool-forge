'use client'

import { useEffect, useRef } from 'react'

import { SPECTRUM, INK } from '@/lib/brand'
import type { TranscriptLine } from '@/modules/voice/client/useVoiceSession'

/**
 * What was said, over the drawing, without taking any of it.
 *
 * The first version was bare halo text with no ground, and on real pages it
 * failed twice over: the halo went fuzzy against the canvas grid, and on white
 * document pages the words landed directly on the page's own text with nothing
 * separating them. So each line now sits on a frosted pill: translucent white
 * with a blur, which reads over water, grid and a project card alike without
 * hiding what is underneath.
 *
 * The pill border is the electric azure run, ui blue into core blue into
 * purple, the same family as the live-session ring around the editor viewport.
 * One gradient means one thing everywhere: this is the live session talking.
 *
 * Two of the original rules still hold. It cannot be clicked:
 * `pointer-events: none` all the way down, so a pill lying over a pool is not a
 * dead patch of canvas. And it has to leave: lines rise as new ones arrive and
 * dissolve into nothing at the top, because an overflow container would either
 * clip mid-word or grow a scrollbar, and a scrollbar reads as a panel.
 */

const PILL_BORDER = `linear-gradient(135deg, ${SPECTRUM.uiBlue}, ${SPECTRUM.blue}, ${SPECTRUM.purple})`

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
      <div className="flex flex-col items-end gap-1.5">
        {lines.map(line => (
          <div
            key={line.id}
            data-transcript-pill={line.role}
            // The gradient is the border: a 1px gradient shell around a frosted
            // core, because `border` cannot take a gradient and a pseudo-element
            // per line is more machinery than a wrapper.
            style={{ background: PILL_BORDER, borderRadius: 12, padding: 1, maxWidth: '100%' }}
          >
            <p
              className={line.role === 'user' ? 'font-medium' : 'font-normal'}
              style={{
                margin: 0,
                textAlign: 'left',
                borderRadius: 11,
                padding: '6px 11px',
                color: INK.black,
                background: `${INK.white}D1`,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <span
                className="block font-mono text-[9px] font-semibold uppercase"
                style={{
                  letterSpacing: '.6px',
                  marginBottom: 1,
                  color: line.role === 'user' ? INK.slate : SPECTRUM.uiBlue,
                }}
              >
                {line.role === 'user' ? 'You' : 'Marco'}
              </span>
              {line.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
