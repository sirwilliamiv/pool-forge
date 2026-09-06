'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import { deleteProject } from '@/modules/projects/actions'
import { FIRST_POOL_SCRIPT, type TrainingContext } from '@/modules/editor/training/first-pool-script'
import { narrate, type Narration } from '@/components/editor/training/narrator'
import type { CameraView } from '@/modules/editor/state/cameraStore'

/** The URL flag that turns the editor into the guided training. */
export const TRAINING_PARAM = 'training'
export const FIRST_POOL_TRAINING = 'first-pool'

// The object for a card drops shortly after the card opens, so Marco names it
// first and you watch it land while he's still talking. Advancing is driven by
// his audio's own `ended`, so a line is never cut off and it never drags.
const ACT_DROP_MS = 700

/** Commands that move the camera themselves; the runner must not reframe after. */
const VIEW_COMMANDS = new Set(['canvas.fit', 'camera.set.view', 'view.set.tab', 'canvas.zoom.in', 'canvas.zoom.out', 'canvas.pan', 'camera.frame.selection'])

/**
 * Marco builds one complete pool while you watch.
 *
 * Renders nothing unless the editor URL carries `?training=first-pool`. Then it
 * walks the fixed script: highlight the control and say the line (hold), then
 * perform the command through the registry (hold), then the next step. Every
 * action is one the user could do by hand; this only paces and narrates them.
 */
export function FirstPoolTraining() {
  // Read the flag from the URL directly rather than useSearchParams: that hook
  // forces a Suspense boundary on the whole editor page at build time (Next 15),
  // and this overlay must not drag one in. The training only ever starts from a
  // fresh navigation, so reading once on mount is enough.
  const [active, setActive] = useState(false)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      setActive(params.get(TRAINING_PARAM) === FIRST_POOL_TRAINING)
    } catch {
      setActive(false)
    }
  }, [])
  if (!active) return null
  return <TrainingRunner />
}

function TrainingRunner() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const projectId = params?.id

  // `started` gates on a real click, which is what lets Marco's audio actually
  // play — without a user gesture the browser blocks it and we drop to the
  // generic fallback voice, which is exactly the "random voice" problem.
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [paused, setPaused] = useState(false)

  const ctx = useRef<TrainingContext>({})
  const acted = useRef<Set<number>>(new Set())
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const narration = useRef<Narration | null>(null)
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const step = FIRST_POOL_SCRIPT[index]

  // Frame everything after a placement so the growing drawing stays on screen.
  // Steps that name their own vantage re-assert it instead.
  const frameFor = useCallback((view: CameraView | undefined) => {
    if (view) void dispatch('camera.set.view', { view }).catch(() => undefined)
    else void dispatch('canvas.fit', {}).catch(() => undefined)
  }, [])

  // Perform a step's action exactly once (Back can revisit a card without
  // rebuilding the pool), then keep the result on screen.
  const performAction = useCallback((i: number) => {
    if (acted.current.has(i)) return
    acted.current.add(i)
    const s = FIRST_POOL_SCRIPT[i]
    const action = s?.run?.(ctx.current)
    if (!action) return
    void dispatch(action.command, action.input).then(res => {
      if (res.ok && s?.capture) s.capture(ctx.current, res.data)
      if (!VIEW_COMMANDS.has(action.command)) frameFor(s?.view)
    })
  }, [frameFor])

  const advanceTo = useCallback((next: number) => {
    if (dropTimer.current) {
      clearTimeout(dropTimer.current)
      dropTimer.current = null
    }
    narration.current?.stop()
    if (next >= FIRST_POOL_SCRIPT.length) setFinished(true)
    else setIndex(next < 0 ? 0 : next)
  }, [])

  // Advance keeps the current card's object (it may have already been placed on
  // the drop timer; performAction is idempotent) and moves on.
  const goNext = useCallback(() => {
    performAction(index)
    advanceTo(index + 1)
  }, [index, performAction, advanceTo])

  const goBack = useCallback(() => advanceTo(index - 1), [index, advanceTo])

  // Enter a card: highlight, snap to its vantage, speak it, drop its object a
  // beat later, and auto-advance when Marco actually finishes the line (his
  // audio's own 'ended') — never a guessed timer, so nothing is cut off and it
  // never drags. Only runs once started (the click that unlocks audio).
  useEffect(() => {
    if (!started || finished || !step) return
    if (step.point?.length) {
      void dispatch('guide.point', { targets: step.point }).catch(() => undefined)
    } else {
      void dispatch('guide.clear', {}).catch(() => undefined)
    }
    if (step.view) void dispatch('camera.set.view', { view: step.view }).catch(() => undefined)

    narration.current?.stop()
    narration.current = narrate(step.say, () => {
      if (!pausedRef.current) goNext()
    })
    dropTimer.current = setTimeout(() => performAction(index), ACT_DROP_MS)
    return () => {
      if (dropTimer.current) clearTimeout(dropTimer.current)
    }
  }, [started, index, finished, step, performAction, goNext])

  // Pause/resume the current line without restarting it.
  useEffect(() => {
    if (!started) return
    if (paused) narration.current?.pause()
    else narration.current?.resume()
  }, [paused, started])

  // Open on an iso overview of the empty yard, so the first object lands in a
  // framed 3D view (never the orthographic plan tab, where the view-cube snaps
  // and Fit are inert). Warm the browser voice list for the fallback path.
  useEffect(() => {
    void dispatch('camera.set.view', { view: 'iso' }).catch(() => undefined)
    void dispatch('canvas.fit', {}).catch(() => undefined)
    try {
      const synth = window.speechSynthesis
      synth?.getVoices()
      const warm = () => synth?.getVoices()
      synth?.addEventListener('voiceschanged', warm)
      return () => synth?.removeEventListener('voiceschanged', warm)
    } catch {
      return undefined
    }
  }, [])

  // Leaving the training clears the highlight and stops any speech.
  useEffect(() => {
    return () => {
      void dispatch('guide.clear', {}).catch(() => undefined)
      narration.current?.stop()
    }
  }, [])

  function onStop() {
    narration.current?.stop()
    setFinished(true)
  }

  async function discard() {
    if (!projectId) return
    try {
      await deleteProject(projectId)
    } catch {
      // Even if the delete fails, get the user out of the training.
    }
    router.push('/dashboard')
  }

  function keep() {
    if (!projectId) {
      router.push('/dashboard')
      return
    }
    // Drop the training flag so a reload doesn't restart it, and land on the
    // real project the user just watched get built.
    router.push(`/projects/${projectId}`)
    toast.success('Kept your practice pool. Everything you saw is yours to edit.')
  }

  if (finished) {
    return (
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4">
        <div className="w-full max-w-md rounded-pfMd border border-border bg-white p-4 shadow-pfLg">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-pfAccent" aria-hidden />
            That&rsquo;s a complete pool
          </div>
          <p className="mt-1 text-[12px] text-textMuted">
            Drawn, measured, priced. This was a practice project — discard it, or keep it to build on.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void discard()}
              className="rounded-pfSm border border-border px-3 py-1.5 text-[12px] font-medium text-textMuted hover:bg-rowHover hover:text-foreground"
            >
              Discard it
            </button>
            <button
              type="button"
              onClick={keep}
              className="rounded-pfSm bg-foreground px-3 py-1.5 text-[12px] font-medium text-white hover:bg-foreground/90"
            >
              Keep it
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!step) return null

  // The Start gate: one click, which is what authorizes Marco's audio to play.
  if (!started) {
    return (
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4">
        <div className="w-full max-w-md rounded-pfMd border border-border bg-white p-4 shadow-pfLg">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-pfAccent" aria-hidden />
            Marco builds your first pool
          </div>
          <p className="mt-1 text-[12px] text-textMuted">
            Watch it go up start to finish, in his voice. It plays on its own; pause or skip any time.
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="flex items-center gap-1.5 rounded-pfSm bg-foreground px-3 py-1.5 text-[12px] font-medium text-white hover:bg-foreground/90"
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              Start the tour
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4">
      <div className="pointer-events-auto w-full max-w-lg rounded-pfMd border border-border bg-white/95 p-3 shadow-pfLg backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-textMuted">
            <Sparkles className="h-3 w-3 text-pfAccent" aria-hidden />
            Marco · step {index + 1} of {FIRST_POOL_SCRIPT.length}
          </span>
          <button
            type="button"
            onClick={onStop}
            title="End the tour"
            className="rounded-pfSm p-1 text-textMuted hover:bg-rowHover hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-foreground">{step.say}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={index === 0}
            title="Back"
            className="flex items-center gap-1 rounded-pfSm px-2 py-1.5 text-[12px] font-medium text-textMuted hover:bg-rowHover hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Back
          </button>
          <button
            type="button"
            onClick={() => setPaused(p => !p)}
            title={paused ? 'Resume' : 'Pause'}
            className="flex items-center gap-1 rounded-pfSm px-2 py-1.5 text-[12px] font-medium text-textMuted hover:bg-rowHover hover:text-foreground"
          >
            {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={goNext}
            title="Skip ahead"
            className="flex items-center gap-1 rounded-pfSm bg-foreground px-3 py-1.5 text-[12px] font-medium text-white hover:bg-foreground/90"
          >
            {index >= FIRST_POOL_SCRIPT.length - 1 ? 'Finish' : 'Next'}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
