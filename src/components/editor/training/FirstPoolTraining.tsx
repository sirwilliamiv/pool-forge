'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Pause, Play, SkipForward, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import { deleteProject } from '@/modules/projects/actions'
import { FIRST_POOL_SCRIPT, type TrainingContext } from '@/modules/editor/training/first-pool-script'
import { narrate, type Narration } from '@/components/editor/training/narrator'
import type { CameraView } from '@/modules/editor/state/cameraStore'

/** The URL flag that turns the editor into the guided training. */
export const TRAINING_PARAM = 'training'
export const FIRST_POOL_TRAINING = 'first-pool'

// The announce beat holds until Marco has actually finished speaking the line,
// so nothing is cut off. These only bound that: never advance before MIN (so a
// very short clip still lingers), and never wait past MAX (so a failed or silent
// clip can't stall the whole tour).
const ANNOUNCE_MIN_MS = 2200
const ANNOUNCE_MAX_MS = 16000
const ACT_SETTLE_MS = 1500

type Beat = 'announce' | 'act'

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

  const [index, setIndex] = useState(0)
  const [beat, setBeat] = useState<Beat>('announce')
  const [paused, setPaused] = useState(false)
  const [finished, setFinished] = useState(false)

  const ctx = useRef<TrainingContext>({})
  const acted = useRef<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Narration state, in refs because it is driven by audio 'ended' callbacks
  // that fire outside React's render, and must read the latest beat/pause.
  const narration = useRef<Narration | null>(null)
  const announceEnded = useRef(false)
  const announceStart = useRef(0)
  const pausedRef = useRef(paused)
  const finishedRef = useRef(finished)
  const beatRef = useRef<Beat>(beat)
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { finishedRef.current = finished }, [finished])
  useEffect(() => { beatRef.current = beat }, [beat])

  const step = FIRST_POOL_SCRIPT[index]

  // Frame everything after a placement so the growing drawing stays on screen.
  // Steps that name their own vantage re-assert it instead, so a top-down site
  // layout or a side-on depth view isn't yanked back to the default angle.
  const frameFor = useCallback((view: CameraView | undefined) => {
    if (view) void dispatch('camera.set.view', { view }).catch(() => undefined)
    else void dispatch('canvas.fit', {}).catch(() => undefined)
  }, [])

  // The one place the sequence moves forward: announce -> act, or act -> next
  // step (or finish). Called by the announce narration, the settle timer, Next.
  const advance = useCallback(() => {
    setBeat(prevBeat => {
      if (prevBeat === 'announce') return 'act'
      setIndex(i => {
        const next = i + 1
        if (next >= FIRST_POOL_SCRIPT.length) {
          setFinished(true)
          return i
        }
        return next
      })
      return 'announce'
    })
  }, [])

  // Advance out of the announce beat only once Marco has finished the line (so
  // nothing is cut off) and at least the minimum hold has passed (so a very
  // short clip still lingers). The safety cap in the effect covers a clip that
  // never ends.
  const tryAdvanceAnnounce = useCallback(() => {
    if (pausedRef.current || finishedRef.current || beatRef.current !== 'announce') return
    if (!announceEnded.current) return
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const elapsed = Date.now() - announceStart.current
    if (elapsed >= ANNOUNCE_MIN_MS) advance()
    else timer.current = setTimeout(advance, ANNOUNCE_MIN_MS - elapsed)
  }, [advance])

  const onNarrationEnded = useCallback(() => {
    announceEnded.current = true
    tryAdvanceAnnounce()
  }, [tryAdvanceAnnounce])

  // Perform the current beat once, then hold. Announce holds until narration
  // ends; act holds a fixed settle. Re-running on pause/resume does not repeat
  // the side effect (guarded by `acted`), it just re-arms timing and audio.
  useEffect(() => {
    if (finished || !step) return
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (paused) {
      narration.current?.pause()
      return
    }
    narration.current?.resume()

    const key = `${index}:${beat}`
    if (!acted.current.has(key)) {
      acted.current.add(key)
      if (beat === 'announce') {
        if (step.point?.length) {
          void dispatch('guide.point', { targets: step.point }).catch(() => undefined)
        } else {
          void dispatch('guide.clear', {}).catch(() => undefined)
        }
        if (step.view) void dispatch('camera.set.view', { view: step.view }).catch(() => undefined)
        announceEnded.current = false
        announceStart.current = Date.now()
        narration.current?.stop()
        narration.current = narrate(step.say, onNarrationEnded)
      } else if (step.run) {
        const action = step.run(ctx.current)
        if (action) {
          void dispatch(action.command, action.input).then(res => {
            if (res.ok && step.capture) step.capture(ctx.current, res.data)
            // Keep the result on screen: reframe unless the command already
            // moved the camera itself.
            if (!VIEW_COMMANDS.has(action.command)) frameFor(step.view)
          })
        }
      }
    }

    if (beat === 'announce') {
      timer.current = setTimeout(advance, ANNOUNCE_MAX_MS)
      // Narration may have finished while paused; catch that on resume.
      if (announceEnded.current) tryAdvanceAnnounce()
    } else {
      timer.current = setTimeout(advance, step.settleMs ?? ACT_SETTLE_MS)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [index, beat, paused, finished, step, advance, frameFor, onNarrationEnded])

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

  function onNext() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    narration.current?.stop()
    advance()
  }

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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4">
      <div className="pointer-events-auto w-full max-w-lg rounded-pfMd border border-border bg-white/95 p-3 shadow-pfLg backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-textMuted">
            <Sparkles className="h-3 w-3 text-pfAccent" aria-hidden />
            Marco · step {index + 1} of {FIRST_POOL_SCRIPT.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPaused(p => !p)}
              title={paused ? 'Resume' : 'Pause'}
              className="rounded-pfSm p-1 text-textMuted hover:bg-rowHover hover:text-foreground"
            >
              {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={onNext}
              title="Next"
              className="rounded-pfSm p-1 text-textMuted hover:bg-rowHover hover:text-foreground"
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onStop}
              title="Stop the tour"
              className="rounded-pfSm p-1 text-textMuted hover:bg-rowHover hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-foreground">{step.say}</p>
      </div>
    </div>
  )
}
