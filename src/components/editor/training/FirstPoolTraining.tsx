'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Pause, Play, SkipForward, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'

import { dispatch } from '@/lib/commands/dispatch'
import { deleteProject } from '@/modules/projects/actions'
import { FIRST_POOL_SCRIPT, type TrainingContext } from '@/modules/editor/training/first-pool-script'

/** The URL flag that turns the editor into the guided training. */
export const TRAINING_PARAM = 'training'
export const FIRST_POOL_TRAINING = 'first-pool'

/**
 * Announce before act, with a deliberate pause on each, so a human always sees
 * what and where before it happens. Named here so they are tuned in one place
 * after watching a real person follow it.
 */
const ANNOUNCE_HOLD_MS = 2500
const ACT_SETTLE_MS = 1500

type Beat = 'announce' | 'act'

/** Commands that move the camera themselves; the runner must not reframe after. */
const VIEW_COMMANDS = new Set(['canvas.fit', 'camera.set.view', 'view.set.tab', 'canvas.zoom.in', 'canvas.zoom.out', 'canvas.pan', 'camera.frame.selection'])

/**
 * The closest thing the browser has to Marco's low, measured voice. Prefer a
 * named premium male voice, then any male English voice, then the platform
 * defaults that read male, and give up gracefully (default voice) if none match
 * rather than staying silent. Voices load async, so this may return null on the
 * first call and a real voice once `voiceschanged` has fired.
 */
function pickMarcoVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices()
  if (!voices.length) return null
  const en = voices.filter(v => v.lang?.toLowerCase().startsWith('en'))
  const pool = en.length ? en : voices
  // Known steady male voices across macOS / Chrome / Windows, best first.
  const preferred = ['Google UK English Male', 'Daniel', 'Arthur', 'Aaron', 'Alex', 'Microsoft Guy', 'Microsoft David', 'Rishi', 'Google US English']
  for (const name of preferred) {
    const hit = pool.find(v => v.name === name) ?? pool.find(v => v.name.includes(name))
    if (hit) return hit
  }
  // Fall back to anything that names itself male.
  return pool.find(v => /\bmale\b/i.test(v.name)) ?? pool[0] ?? null
}

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

  const step = FIRST_POOL_SCRIPT[index]

  const speak = useCallback((line: string) => {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.cancel()
      const u = new SpeechSynthesisUtterance(line)
      // Marco is low and measured (the live session uses Gemini's "Charon").
      // A live session would sound exactly like him; with the mic off we pick
      // the closest steady male voice the browser has and slow it slightly, so
      // it reads as Marco rather than the machine's random default.
      const voice = pickMarcoVoice(synth)
      if (voice) u.voice = voice
      u.rate = 0.95
      u.pitch = 0.9
      synth.speak(u)
    } catch {
      // Speech is a bonus; the caption is the real narration.
    }
  }, [])

  // Nudge the camera to keep the whole growing drawing in view during the hold,
  // so the user actually sees each new object land. Skipped for steps that are
  // themselves about the camera.
  const frameAll = useCallback(() => {
    void dispatch('canvas.fit', {}).catch(() => undefined)
  }, [])

  // The one place the sequence moves forward: announce -> act, or act -> next
  // step (or finish). Called by the hold timer and by Next.
  const advance = useCallback(() => {
    setBeat(prevBeat => {
      if (prevBeat === 'announce') return 'act'
      // act -> next step
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

  // Perform the current beat once, then schedule the hold. Re-running on
  // pause/resume does not repeat the side effect (guarded by `acted`).
  useEffect(() => {
    if (finished || !step) return
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (paused) return

    const key = `${index}:${beat}`
    if (!acted.current.has(key)) {
      acted.current.add(key)
      if (beat === 'announce') {
        // guide.point requires at least one target; a narration-only step points
        // at nothing, so clear any leftover highlight instead of pointing.
        if (step.point?.length) {
          void dispatch('guide.point', { targets: step.point }).catch(() => undefined)
        } else {
          void dispatch('guide.clear', {}).catch(() => undefined)
        }
        speak(step.say)
      } else if (step.run) {
        const action = step.run(ctx.current)
        if (action) {
          void dispatch(action.command, action.input).then(res => {
            if (res.ok && step.capture) step.capture(ctx.current, res.data)
            // Reframe after anything that changes the drawing, so the object we
            // just placed is on screen for the settle hold. Camera/view commands
            // frame themselves; don't fight them.
            if (!VIEW_COMMANDS.has(action.command)) frameAll()
          })
        }
      }
    }

    const hold = beat === 'announce' ? ANNOUNCE_HOLD_MS : step.settleMs ?? ACT_SETTLE_MS
    timer.current = setTimeout(advance, hold)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [index, beat, paused, finished, step, speak, advance])

  // Look straight down at the whole sheet before anything is placed, so the
  // yard fills the view and every object lands where the user is already
  // looking. Also warm the browser's voice list (it loads async) so Marco's
  // voice is ready by the first spoken line.
  useEffect(() => {
    void dispatch('view.set.tab', { tab: 'plan' }).catch(() => undefined)
    void dispatch('camera.set.view', { view: 'top' }).catch(() => undefined)
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
      try {
        window.speechSynthesis?.cancel()
      } catch {
        // ignore
      }
    }
  }, [])

  function onNext() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    advance()
  }

  function onStop() {
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
