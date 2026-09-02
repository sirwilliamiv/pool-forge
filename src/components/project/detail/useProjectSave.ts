'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { dispatch } from '@/lib/commands/dispatch'
import type { ProjectDetailFields } from './types'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * How long to wait after the last keystroke before saving.
 *
 * Long enough not to write an audit row per character, short enough that
 * clicking away from a field you have just typed into does not lose it. The
 * command dispatch doc's flood warning is about per-keystroke dispatch; a
 * debounced commit is exactly the pattern it prescribes.
 */
const AUTOSAVE_DELAY_MS = 800

export interface ProjectSave {
  form: ProjectDetailFields
  /** A text edit: saves on a debounce. */
  update: <K extends keyof ProjectDetailFields>(key: K, value: ProjectDetailFields[K]) => void
  /** Several fields changed by one keystroke, still on the typing debounce. */
  updatePatch: (patch: Partial<ProjectDetailFields>) => void
  /** A discrete choice (select, checkbox): saves immediately. */
  updateNow: (patch: Partial<ProjectDetailFields>) => void
  saveState: SaveState
  /** Save now: the header's error Retry. */
  flush: () => void
}

function countDirty(a: ProjectDetailFields, b: ProjectDetailFields): number {
  let n = 0
  for (const key of Object.keys(a) as Array<keyof ProjectDetailFields>) {
    if (a[key] !== b[key]) n += 1
  }
  return n
}

/**
 * One form state for every section on the project page, and one save path:
 * text on a debounce, discrete controls on change, everything written through
 * the `project.update` command, state announced in the header.
 */
export function useProjectSave(projectId: string, initial: ProjectDetailFields): ProjectSave {
  const router = useRouter()
  const [form, setForm] = React.useState(initial)
  const [saveState, setSaveState] = React.useState<SaveState>('idle')
  const [lastSaved, setLastSaved] = React.useState(initial)

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The freshest values, so unmount and timers never save stale state. */
  const formRef = React.useRef(form)
  formRef.current = form
  const lastSavedRef = React.useRef(lastSaved)
  lastSavedRef.current = lastSaved
  /** Nothing has been edited yet, so hydration must not trigger a write. */
  const dirty = React.useRef(false)

  const save = React.useCallback(
    async (values: ProjectDetailFields) => {
      if (countDirty(values, lastSavedRef.current) === 0) return
      setSaveState('saving')
      const res = await dispatch('project.update', { projectId, fields: values })
      if (!res.ok) {
        setSaveState('error')
        return
      }
      setLastSaved(values)
      setSaveState('saved')
      // So the header, the dashboard and anything else reading the name agree
      // with the field the user just typed into.
      router.refresh()
    },
    [projectId, router],
  )

  /**
   * Delay for the save the NEXT commit should schedule; null when no edit is
   * pending. The timer is armed from an effect on `form` rather than from the
   * setter, because a `setTimeout(0)` armed in the setter can fire before
   * React commits the state it is meant to save — the resolved address
   * arrived, the form showed it, and the write carried the previous values.
   */
  const pendingDelay = React.useRef<number | null>(null)

  const applyPatch = React.useCallback((patch: Partial<ProjectDetailFields>, immediate: boolean) => {
    dirty.current = true
    const delay = immediate ? 0 : AUTOSAVE_DELAY_MS
    pendingDelay.current = Math.min(pendingDelay.current ?? Number.POSITIVE_INFINITY, delay)
    setForm((prev) => ({ ...prev, ...patch }))
  }, [])

  React.useEffect(() => {
    const delay = pendingDelay.current
    if (delay === null) return
    pendingDelay.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void save(formRef.current)
    }, delay)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form, save])

  const update = React.useCallback(
    <K extends keyof ProjectDetailFields>(key: K, value: ProjectDetailFields[K]) => {
      applyPatch({ [key]: value } as Partial<ProjectDetailFields>, false)
    },
    [applyPatch],
  )

  const updatePatch = React.useCallback(
    (patch: Partial<ProjectDetailFields>) => applyPatch(patch, false),
    [applyPatch],
  )

  const updateNow = React.useCallback(
    (patch: Partial<ProjectDetailFields>) => applyPatch(patch, true),
    [applyPatch],
  )

  const flush = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    void save(formRef.current)
  }, [save])

  // A pending edit must not die with the page. Leaving during the debounce
  // window is exactly when someone types a name and immediately clicks away.
  React.useEffect(() => {
    return () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      void dispatch('project.update', { projectId, fields: formRef.current })
    }
  }, [projectId])

  return {
    form,
    update,
    updatePatch,
    updateNow,
    saveState,
    flush,
  }
}
