'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSurveyStore } from '@/modules/editor/state/surveyStore'
import { useSaveStatusStore } from '@/modules/editor/state/saveStore'
import { saveDrawing } from '@/modules/editor/persistence'
import { recomputeAndCacheEditor } from '@/lib/cache/editor'
import type { Shape } from '@/modules/editor/state/shapes'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'

interface EditorPersistenceProps {
  projectId: string
  initial: { shapes: Shape[]; survey?: SurveyConfig | null }
}

const DEBOUNCE_MS = 800

export function EditorPersistence({ projectId, initial }: EditorPersistenceProps) {
  const hydratedRef = useRef(false)
  const skipNextRef = useRef({ shapes: false, survey: false })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate once on mount.
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    skipNextRef.current.shapes = true
    skipNextRef.current.survey = true
    useShapesStore.getState().hydrate(initial.shapes)
    useSurveyStore.getState().setSurvey(initial.survey ?? null)
  }, [initial])

  // Subscribe to shapes + survey changes; debounce-save.
  useEffect(() => {
    function scheduleSave() {
      useSaveStatusStore.getState().setStatus('saving')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        const shapes = useShapesStore.getState().shapes
        const survey = useSurveyStore.getState().survey
        void saveDrawing(projectId, { shapes, survey })
          .then(() => {
            useSaveStatusStore.getState().markSaved()
            // Fire-and-forget: refresh quote + validation caches off the saved drawing.
            void recomputeAndCacheEditor(projectId).catch((err) =>
              console.error('recomputeAndCacheEditor failed', err),
            )
          })
          .catch((err) => {
            console.error('saveDrawing failed', err)
            useSaveStatusStore.getState().setStatus('error')
            toast.error('Failed to save changes — retrying…')
          })
      }, DEBOUNCE_MS)
    }

    const unsubShapes = useShapesStore.subscribe((state, prev) => {
      if (state.shapes === prev.shapes) return
      if (skipNextRef.current.shapes) {
        skipNextRef.current.shapes = false
        return
      }
      scheduleSave()
    })

    const unsubSurvey = useSurveyStore.subscribe((state, prev) => {
      if (state.survey === prev.survey) return
      if (skipNextRef.current.survey) {
        skipNextRef.current.survey = false
        return
      }
      scheduleSave()
    })

    return () => {
      unsubShapes()
      unsubSurvey()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [projectId])

  return null
}
