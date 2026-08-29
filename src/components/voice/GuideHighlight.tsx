'use client'

import { useEffect, useState } from 'react'

import { useGuideStore } from '@/modules/guide/store'
import { isVisible, resolveTarget } from '@/modules/guide/resolve'
import { targetById } from '@/modules/guide/targets'

/**
 * Rings around whatever Marco is pointing at.
 *
 * Several at once, because "where are the drawing tools" is three answers and
 * lighting them one at a time is a worse answer than lighting them together.
 *
 * Fixed to the viewport and re-measured on scroll and resize, because a ring
 * drawn once drifts off its control the moment a panel scrolls, and a highlight
 * that points at the wrong thing is worse than none.
 *
 * Never takes a pointer event. The whole promise of this assistant is that he
 * shows you where something is and you are the one who clicks it, so a ring
 * that swallowed the click would break the only rule he has.
 */
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

    measure()
    // Passive and on the window: panels scroll, the inspector scrolls, and the
    // ring has to follow all of it without owning a listener per container.
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    window.addEventListener('resize', measure, { passive: true })
    const timer = window.setInterval(measure, 400)
    return () => {
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
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
          className="absolute rounded-md"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            border: '2px solid #F59E0B',
            boxShadow: '0 0 0 4px rgba(245,158,11,.18)',
            transition: 'left .18s ease, top .18s ease, width .18s ease, height .18s ease',
          }}
        >
          <span
            className="absolute left-0 top-full mt-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: '#F59E0B', color: '#1F2937' }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
