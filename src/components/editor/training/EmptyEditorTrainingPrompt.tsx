'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'

import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { StartFirstPoolTraining } from '@/components/onboarding/StartFirstPoolTraining'
import { FIRST_POOL_TRAINING, TRAINING_PARAM } from './FirstPoolTraining'

/**
 * A quiet nudge on a blank canvas: offer to watch Marco build one. Shows only
 * when the drawing is empty and we are not already running the training, and
 * gets out of the way the moment the user places anything or dismisses it.
 */
export function EmptyEditorTrainingPrompt() {
  const isEmpty = useShapesStore(s => s.shapes.length === 0)
  const [dismissed, setDismissed] = useState(false)
  const [inTraining, setInTraining] = useState(true)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      setInTraining(params.get(TRAINING_PARAM) === FIRST_POOL_TRAINING)
    } catch {
      setInTraining(false)
    }
  }, [])

  if (dismissed || inTraining || !isEmpty) return null

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-pfMd border border-border bg-white/95 px-3 py-2 shadow-pfLg backdrop-blur">
        <span className="flex items-center gap-1.5 text-[12px] text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-pfAccent" aria-hidden />
          New here? Watch me build one first.
        </span>
        <StartFirstPoolTraining
          label="Show me"
          className="inline-flex items-center gap-1.5 rounded-pfSm bg-foreground px-2.5 py-1 text-[12px] font-medium text-white hover:bg-foreground/90 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded-pfSm p-1 text-textMuted hover:bg-rowHover hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
