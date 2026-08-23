'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useSurveyStore } from '@/modules/editor/state/surveyStore'
import { useSaveStatusStore } from '@/modules/editor/state/saveStore'
import { saveDrawing } from '@/modules/editor/persistence'
import { recomputeAndCacheEditor } from '@/lib/cache/editor'
import type { Shape } from '@/modules/editor/state/shapes'
import type { SiteGrade } from '@/modules/editor/grade/model'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'

interface EditorPersistenceProps {
  projectId: string
  initial: {
    shapes: Shape[]
    survey?: SurveyConfig | null
    /** Absent on any drawing made before grading existed: that means flat. */
    grade?: { existing: SiteGrade; finished: SiteGrade } | null
  }
}

const DEBOUNCE_MS = 800

export function EditorPersistence({ projectId, initial }: EditorPersistenceProps) {
  const hydratedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The latest values, so a flush on the way out does not read stale state. */
  const pendingRef = useRef(false)

  useEffect(() => {
    /**
     * Write the drawing.
     *
     * Shared by the debounce and by the flush on the way out, so leaving the
     * page mid-debounce writes the same thing waiting to be written rather than
     * something assembled a second way.
     */
    function writeNow(): Promise<void> {
      pendingRef.current = false
      const shapes = useShapesStore.getState().shapes
      const survey = useSurveyStore.getState().survey
      const { existing, finished } = useGradeStore.getState()
      return saveDrawing(projectId, { shapes, survey, grade: { existing, finished } })
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
          // Says what is true. It said "retrying" and nothing retried, so a
          // builder was told their work was on its way when it was not.
          toast.error('Could not save your changes. Check your connection.')
        })
    }

    function scheduleSave() {
      pendingRef.current = true
      useSaveStatusStore.getState().setStatus('saving')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        void writeNow()
      }, DEBOUNCE_MS)
    }

    // Subscribed before the drawing is hydrated, not after.
    //
    // This is what lost the first edit on every project. The two were separate
    // effects, and React runs them in order, so hydration happened before any
    // subscription existed: the "ignore the hydrate" flag was never spent by the
    // hydrate, and the first real edit spent it instead. Place a pool, reload,
    // and it was gone. Every edit after the first saved, which is worse than
    // none saving, because you cannot tell which of your work is real.
    let hydrating = true

    const changed = () => {
      if (hydrating) return
      scheduleSave()
    }

    const unsubShapes = useShapesStore.subscribe((state, prev) => {
      if (state.shapes !== prev.shapes) changed()
    })
    const unsubSurvey = useSurveyStore.subscribe((state, prev) => {
      if (state.survey !== prev.survey) changed()
    })
    // Grading had no subscription at all, so elevations were only ever written
    // when a shape happened to change in the same session.
    const unsubGrade = useGradeStore.subscribe((state, prev) => {
      if (state.existing !== prev.existing || state.finished !== prev.finished) changed()
    })

    if (!hydratedRef.current) {
      hydratedRef.current = true
      useShapesStore.getState().hydrate(initial.shapes)
      useSurveyStore.getState().setSurvey(initial.survey ?? null)
      useGradeStore.getState().hydrate(initial.grade ?? null)
    }
    hydrating = false

    /**
     * Leaving with work in the debounce window.
     *
     * `pagehide` rather than `beforeunload`, because it also fires when a tab is
     * put into the back/forward cache, and `keepalive` lets the request outlive
     * the page. Eight hundred milliseconds is a short window and closing a tab
     * right after an edit is a normal thing to do.
     */
    function flushOnLeave() {
      if (!pendingRef.current) return
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      void writeNow()
    }

    window.addEventListener('pagehide', flushOnLeave)

    return () => {
      window.removeEventListener('pagehide', flushOnLeave)
      unsubShapes()
      unsubSurvey()
      unsubGrade()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      // Navigating away inside the editor unmounts this, and the pending write
      // is just as real as one interrupted by closing the tab.
      flushOnLeave()
    }
  }, [projectId, initial])

  return null
}
