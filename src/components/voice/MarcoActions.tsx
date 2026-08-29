'use client'

import { useEffect, useState } from 'react'
import { Compass, Mic } from 'lucide-react'

import { resolveTarget } from '@/modules/guide/resolve'
import { useGuideStore } from '@/modules/guide/store'
import { GUIDE_TARGETS } from '@/modules/guide/targets'

/**
 * What Marco can do, offered before you have to ask.
 *
 * Nothing told a new user he existed for anything but talking, which is a lot
 * to ask of somebody who has not worked out the toolbar yet. These appear on
 * hover and disappear again, so they cost nothing to anybody who already knows.
 *
 * The tour deliberately calls no model. It resolves what is on screen and rings
 * it, which is instant, free, works with the microphone switched off, and
 * cannot say anything untrue: every label comes from the control it is pointing
 * at. Voice is the other pill, for the questions a list cannot answer.
 */

/** How long a tour stays up before it clears itself, in milliseconds. */
const TOUR_MS = 9000

/** How many controls a tour rings at once. More than this is a wall, not a tour. */
const TOUR_SIZE = 5

interface Props {
  visible: boolean
  onTalk: () => void
}

export function MarcoActions({ visible, onTalk }: Props) {
  const point = useGuideStore(state => state.point)
  const clear = useGuideStore(state => state.clear)
  const [touring, setTouring] = useState(false)

  useEffect(() => {
    if (!touring) return
    const timer = window.setTimeout(() => {
      clear()
      setTouring(false)
    }, TOUR_MS)
    return () => window.clearTimeout(timer)
  }, [touring, clear])

  function tour() {
    // Only what is actually here. Ringing a control that lives on another
    // screen is how a tour teaches somebody the wrong page.
    const here = GUIDE_TARGETS.filter(target => resolveTarget(document, target) !== null)
    if (here.length === 0) return
    point(here.slice(0, TOUR_SIZE).map(target => target.id))
    setTouring(true)
  }

  return (
    <div
      data-marco-actions
      className={[
        'pointer-events-auto flex flex-col items-end gap-1.5 transition-all duration-200',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0',
      ].join(' ')}
    >
      <Pill onClick={tour} icon={<Compass className="h-3.5 w-3.5" aria-hidden />}>
        Explain this page
      </Pill>
      <Pill onClick={onTalk} icon={<Mic className="h-3.5 w-3.5" aria-hidden />}>
        Ask me a question
      </Pill>
    </div>
  )
}

function Pill({
  onClick,
  icon,
  children,
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[12px] font-medium text-slate-900 shadow-sm backdrop-blur transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
    >
      {icon}
      {children}
    </button>
  )
}
