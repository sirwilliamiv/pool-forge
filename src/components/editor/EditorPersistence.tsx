'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { useSurveyStore } from '@/modules/editor/state/surveyStore'
import { useSaveStatusStore } from '@/modules/editor/state/saveStore'
import { saveDrawing } from '@/modules/editor/persistence'
import { captureError } from '@/modules/monitoring'
import { isStaleBuild } from '@/modules/editor/stale-build'
import { recomputeAndCacheEditor } from '@/lib/cache/editor'
import type { Shape } from '@/modules/editor/state/shapes'
import type { SiteGrade } from '@/modules/editor/grade/model'
import type { DrawingComment } from '@/modules/editor/comments/model'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'

interface EditorPersistenceProps {
  projectId: string
  initial: {
    shapes: Shape[]
    survey?: SurveyConfig | null
    /** Absent on any drawing made before grading existed: that means flat. */
    grade?: { existing: SiteGrade; finished: SiteGrade } | null
    /** Absent on any drawing made before comments existed: that means none. */
    comments?: DrawingComment[] | null
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
      const comments = useCommentsStore.getState().comments
      return saveDrawing(projectId, { shapes, survey, grade: { existing, finished }, comments })
        .then(() => {
          useSaveStatusStore.getState().markSaved()
          // Fire-and-forget: refresh quote + validation caches off the saved drawing.
          void recomputeAndCacheEditor(projectId).catch((error) => {
            captureError({ error, code: 'editor.recompute_failed', origin: 'client' })
          })
        })
        .catch((error) => {
          captureError({ error, code: 'editor.save_failed', origin: 'client' })
          useSaveStatusStore.getState().setStatus('error')

          // A tab left open across a deploy holds a bundle whose server action
          // ids no longer exist, so every save fails with "was not found on the
          // server" while the drawing keeps changing on screen. Telling that
          // person to check their connection sends them to look at their wifi
          // while their work quietly goes nowhere. A reload is the whole fix,
          // so say so and offer it.
          if (isStaleBuild(error)) {
            toast.error('Pool Forge was updated while this was open. Reload to keep saving.', {
              duration: Infinity,
              action: { label: 'Reload', onClick: () => window.location.reload() },
            })
            return
          }

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
    // Subscribed here, in this effect, above the hydrate below. A separate
    // effect is exactly the shape of the bug that lost the first edit on every
    // project, and a note is a sentence somebody typed: losing the first one
    // silently is not a thing this can be allowed to do.
    //
    // `comments` only. The store also holds which pin is open and which one is
    // being written, and neither of those is worth a database write.
    const unsubComments = useCommentsStore.subscribe((state, prev) => {
      if (state.comments !== prev.comments) changed()
    })

    if (!hydratedRef.current) {
      hydratedRef.current = true
      useShapesStore.getState().hydrate(initial.shapes)
      useSurveyStore.getState().setSurvey(initial.survey ?? null)
      useGradeStore.getState().hydrate(initial.grade ?? null)
      useCommentsStore.getState().hydrate(initial.comments ?? [])
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
      unsubComments()
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
