'use client'

import { useEffect, useRef } from 'react'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSaveStatusStore } from '@/modules/editor/state/saveStore'
import { saveDrawing } from '@/modules/editor/persistence'
import type { Shape } from '@/modules/editor/state/shapes'

interface EditorPersistenceProps {
  projectId: string
  initial: { shapes: Shape[] }
}

const DEBOUNCE_MS = 800

export function EditorPersistence({ projectId, initial }: EditorPersistenceProps) {
  const hydratedRef = useRef(false)
  const skipNextRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate once on mount.
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    skipNextRef.current = true
    useShapesStore.getState().hydrate(initial.shapes)
  }, [initial])

  // Subscribe to shapes changes; debounce-save.
  useEffect(() => {
    const unsubscribe = useShapesStore.subscribe((state, prev) => {
      if (state.shapes === prev.shapes) return
      if (skipNextRef.current) {
        skipNextRef.current = false
        return
      }

      useSaveStatusStore.getState().setStatus('saving')

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      const snapshot = state.shapes
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        void saveDrawing(projectId, { shapes: snapshot })
          .then(() => {
            useSaveStatusStore.getState().markSaved()
          })
          .catch((err) => {
            console.error('saveDrawing failed', err)
            useSaveStatusStore.getState().setStatus('error')
          })
      }, DEBOUNCE_MS)
    })

    return () => {
      unsubscribe()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [projectId])

  return null
}
