'use client'

import { SPECTRUM, TINTS } from '@/lib/brand'
import { useVoiceLiveStore } from '@/modules/voice/client/liveStore'

/**
 * The viewport says a session is live.
 *
 * When Marco starts listening, a 2px azure line draws itself around the editor
 * viewport, then dissolves into a slowly drifting gradient ring that holds for
 * the whole session and retracts when it ends. Colour on a border is something
 * the brand bible forbids for chrome, and that is exactly why it works here: it
 * exists only while a session is live, so it is state, not decoration.
 *
 * The hues are the cool half of the spectrum on purpose. Orange and red mean a
 * warning and an error everywhere else in this product, and a border that
 * cycles through them would read as the editor failing on a loop.
 *
 * Never takes a pointer event, and never triggers layout: the draw is an SVG
 * stroke and the drift is a masked conic gradient rotating via a registered
 * custom property, both compositor work.
 */

const COOL_BOLDS = [SPECTRUM.blue, TINTS.aqua, SPECTRUM.green, SPECTRUM.purple, SPECTRUM.blue]

export function LiveSessionBorder() {
  const live = useVoiceLiveStore(state => state.status === 'live')

  return (
    <div
      aria-hidden
      data-live-border={live ? 'live' : 'idle'}
      className="pointer-events-none absolute inset-0 z-50"
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <rect pathLength={100} />
      </svg>
      <div data-live-drift />
      <style>{`
        @property --pf-live-angle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        [data-live-border] rect {
          x: 3px; y: 3px;
          width: calc(100% - 6px); height: calc(100% - 6px);
          rx: 10px; fill: none;
          stroke: ${SPECTRUM.blue}; stroke-width: 2;
          stroke-dasharray: 100; stroke-dashoffset: 100; stroke-opacity: 1;
          transition: stroke-dashoffset .6s cubic-bezier(.3,0,.2,1), stroke-opacity .3s;
        }
        [data-live-border="live"] rect {
          stroke-dashoffset: 0; stroke-opacity: 0;
          transition: stroke-dashoffset 1.1s cubic-bezier(.3,0,.2,1), stroke-opacity .9s ease 1.05s;
        }
        [data-live-drift] {
          position: absolute; inset: 2px; border-radius: 11px; padding: 2px;
          opacity: 0; transition: opacity .45s ease;
          background: conic-gradient(from var(--pf-live-angle), ${COOL_BOLDS.join(', ')});
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }
        [data-live-border="live"] [data-live-drift] {
          opacity: 1; transition: opacity 1s ease .95s;
          animation: pf-live-drift 16s linear infinite;
        }
        @keyframes pf-live-drift { to { --pf-live-angle: 360deg; } }
        @media (prefers-reduced-motion: reduce) {
          [data-live-border] rect { transition: none; }
          [data-live-border="live"] [data-live-drift] { animation: none; transition: none; }
        }
      `}</style>
    </div>
  )
}
