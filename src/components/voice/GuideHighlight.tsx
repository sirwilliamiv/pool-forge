'use client'

import { useEffect, useState } from 'react'

import { SPECTRUM } from '@/lib/brand'
import { isVisible, resolveTarget } from '@/modules/guide/resolve'
import { targetById } from '@/modules/guide/targets'
import { useGuideStore } from '@/modules/guide/store'

/**
 * Rings around whatever Marco is pointing at.
 *
 * Several at once, because "where are the drawing tools" is three answers and
 * lighting them one at a time is a worse answer than lighting them together.
 *
 * Purple from the brand spectrum, not a warning colour. Amber and red already
 * mean something in this app: a validation warning and an error. Pointing at a
 * control somebody asked about must not look like something is wrong with it,
 * and purple is the one hue in the spectrum that carries no existing state.
 *
 * Loud on purpose. The first version was a two-pixel line, and the honest
 * report on it was that nothing appeared to be highlighted at all: a thin
 * outline on a busy toolbar is invisible next to the buttons' own borders. This
 * is a thick ring, a wash inside it, a glow outside, and a pulse on arrival, so
 * the answer to "where is that" is impossible to miss.
 *
 * Fixed to the viewport and re-measured, because a ring drawn once drifts off
 * its control the moment a panel scrolls, and a highlight pointing at the wrong
 * thing is worse than none.
 *
 * Never takes a pointer event. The whole promise is that he shows you where
 * something is and you click it, so a ring that swallowed the click would break
 * the only rule he has.
 */

const RING = SPECTRUM.purple

export function GuideHighlight() {
  const ids = useGuideStore(state => state.highlighted)
  const [boxes, setBoxes] = useState<{ id: string; rect: DOMRect; label: string }[]>([])

  useEffect(() => {
    if (ids.length === 0) {
      setBoxes([])
      return
    }

    function measure() {
      const next: { id: string; rect: DOMRect; label: string }[] = []
      for (const id of ids) {
        const target = targetById(id)
        if (!target) continue
        const element = resolveTarget(document, target)
        if (!element || !isVisible(element)) continue
        next.push({ id, rect: element.getBoundingClientRect(), label: target.name })
      }
      setBoxes(next)
    }

    function onPointerDown(event: PointerEvent) {
      // Clicking anywhere means the user found what they were looking for,
      // except the dock itself: "Explain this page" must not clear its own tour.
      const target = event.target as Element | null
      if (target?.closest('[data-marco-actions]')) return
      useGuideStore.getState().clear()
    }

    measure()
    // Passive, and on the window with capture: panels scroll, the inspector
    // scrolls, and the ring has to follow all of it without owning a listener
    // per container.
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    window.addEventListener('resize', measure, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    const timer = window.setInterval(measure, 400)
    return () => {
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.clearInterval(timer)
    }
  }, [ids])

  if (boxes.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
      {boxes.map(({ id, rect, label }) => (
        <div
          key={id}
          data-guide-ring={id}
          className="absolute"
          style={{
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 10,
            border: `3px solid ${RING}`,
            // Three layers of glow rather than one, so it reads on a white
            // panel and on the dark toolbar alike.
            boxShadow: `0 0 0 4px ${RING}33, 0 0 18px 2px ${RING}66, inset 0 0 0 9999px ${RING}14`,
            animation: 'pf-guide-pop .42s cubic-bezier(.2,1.3,.4,1)',
            transition: 'left .18s ease, top .18s ease, width .18s ease, height .18s ease',
          }}
        >
          <span
            className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide shadow-lg"
            style={{ background: RING, color: '#FFFFFF' }}
          >
            {label}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes pf-guide-pop {
          0%   { transform: scale(1.16); opacity: 0; }
          60%  { transform: scale(.99);  opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-guide-ring] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
