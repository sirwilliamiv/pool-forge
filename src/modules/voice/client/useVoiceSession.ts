'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { dispatch } from '@/lib/commands/dispatch'

import {
  getVoiceBridge,
  type SerializedScope,
  type VoiceBridge,
  type VoiceToolCallEvent,
} from '../bridge'
import type { VoiceScreen } from '../scope'
import { startCapture, VoicePlayback, type CaptureHandle } from './audio'

// The browser half of the voice agent.
//
// Its one job on the way in is to keep everything that must happen inside the
// click gesture inside the click gesture, and its one job on the way back is to
// run the model's tool calls through `dispatch()` — the same function every
// button calls, so voice inherits validation, org scoping and the audit row
// rather than acquiring a second execution path that drifts.

export type VoiceStatus = 'unavailable' | 'idle' | 'starting' | 'live' | 'error'

export interface TranscriptLine {
  id: number
  role: 'user' | 'model'
  text: string
}

export interface UseVoiceSession {
  status: VoiceStatus
  /** Safe to display. Never provider text. */
  error: string | null
  transcript: TranscriptLine[]
  /** Call from a click handler. Anything else and the microphone stays silent. */
  start: () => Promise<void>
  stop: () => Promise<void>
}

/** How many lines of transcript to keep on screen. */
const TRANSCRIPT_LIMIT = 40

export function useVoiceSession(screen: VoiceScreen, projectId?: string): UseVoiceSession {
  const bridge = useRef<VoiceBridge | null>(null)
  const capture = useRef<CaptureHandle | null>(null)
  const playback = useRef<VoicePlayback | null>(null)
  const unsubscribes = useRef<(() => void)[]>([])
  const lineId = useRef(0)

  const [status, setStatus] = useState<VoiceStatus>('unavailable')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])

  useEffect(() => {
    bridge.current = getVoiceBridge()
    setStatus(bridge.current ? 'idle' : 'unavailable')
  }, [])

  // Set when a turn ends, so the next fragment starts a new caption line rather
  // than continuing the last answer's sentence.
  const startNewLine = useRef(false)

  const addLine = useCallback((role: 'user' | 'model', text: string) => {
    if (!text.trim()) return
    setTranscript(previous => {
      const last = previous[previous.length - 1]
      // The Live API streams transcription in fragments. Appending to the last
      // line of the same speaker reads as speech; one line per fragment reads as
      // a stutter.
      if (last?.role === role && !startNewLine.current) {
        const merged = [...previous]
        merged[merged.length - 1] = { ...last, text: last.text + text }
        return merged.slice(-TRANSCRIPT_LIMIT)
      }
      startNewLine.current = false
      lineId.current += 1
      return [...previous, { id: lineId.current, role, text }].slice(-TRANSCRIPT_LIMIT)
    })
  }, [])

  const teardown = useCallback(async () => {
    for (const off of unsubscribes.current) off()
    unsubscribes.current = []
    const currentCapture = capture.current
    capture.current = null
    await currentCapture?.stop()
    const currentPlayback = playback.current
    playback.current = null
    await currentPlayback?.close()
  }, [])

  const stop = useCallback(async () => {
    await teardown()
    await bridge.current?.stop()
    setStatus(bridge.current ? 'idle' : 'unavailable')
  }, [teardown])

  const start = useCallback(async () => {
    const current = bridge.current
    if (!current || status === 'live' || status === 'starting') return

    setError(null)
    setStatus('starting')
    setTranscript([])

    // Both of these must happen while the gesture is still live. The mic prompt
    // and the AudioContext are gated on it, and a context created after the
    // first await is suspended with no error to notice.
    const player = new VoicePlayback()
    player.open()
    playback.current = player

    let started: CaptureHandle
    try {
      started = await startCapture(frame => current.sendAudio(frame))
    } catch {
      await teardown()
      setStatus('error')
      setError('Pool Forge could not use the microphone. Check the permission and try again.')
      return
    }
    capture.current = started

    let surfaces: Record<VoiceScreen, SerializedScope>
    try {
      surfaces = await fetchSurfaces()
    } catch {
      await teardown()
      setStatus('error')
      setError('Could not load the list of things voice can do here.')
      return
    }

    unsubscribes.current = [
      current.onAudio(frame => playback.current?.enqueue(frame)),
      current.onInterrupted(() => playback.current?.flush()),
      current.onTurnComplete(() => {
        startNewLine.current = true
      }),
      current.onTranscript(event => addLine(event.role, event.text)),
      current.onClosed(reason => {
        void teardown()
        setStatus('idle')
        setError(reason)
      }),
      current.onToolCall(event => {
        void runToolCall(current, event, projectId)
      }),
    ]

    const request = projectId === undefined
      ? { screen, surfaces }
      : { screen, surfaces, projectId }
    const result = await current.start(request)

    if (!result.ok) {
      await teardown()
      setStatus('error')
      setError(result.ref ? `${result.error ?? 'Voice could not start.'} (${result.ref})` : result.error ?? 'Voice could not start.')
      return
    }

    setStatus('live')
  }, [addLine, projectId, screen, status, teardown])

  // Moving between screens swaps what the agent can do without ending the call.
  useEffect(() => {
    if (status === 'live') bridge.current?.setScreen(screen)
  }, [screen, status])

  // A session outlives the component only as a bill, so end it on unmount.
  useEffect(() => {
    return () => {
      void teardown()
      void bridge.current?.stop()
    }
  }, [teardown])

  return { status, error, transcript, start, stop }
}

/**
 * Run one tool call and report back.
 *
 * `dispatch()` is deliberate: it posts to `/api/commands`, which validates,
 * scopes to the org and writes the audit row, and then runs the client handler
 * so the editor store updates before the model has finished its sentence.
 */
async function runToolCall(
  bridge: VoiceBridge,
  event: VoiceToolCallEvent,
  projectId: string | undefined,
): Promise<void> {
  try {
    // Labelled VOICE so the audit log can answer "what did the agent actually
    // do, and did it work" — which is the whole basis of evaluating it.
    const result = await dispatch(event.commandId, withProjectId(event.args, projectId), 'VOICE')
    bridge.respond({
      requestId: event.requestId,
      outcome: result.ok
        ? { ok: true, summary: summarize(event.commandId, result.data), data: result.data }
        : { ok: false, summary: result.error },
    })
  } catch {
    bridge.respond({
      requestId: event.requestId,
      outcome: { ok: false, summary: `${event.commandId} could not be completed.` },
    })
  }
}

/**
 * Fill in the project from the URL when the model left it out.
 *
 * The model cannot know a project id: nobody speaks one, and asking it to
 * remember one across a conversation is asking it to invent one. The browser
 * knows exactly which project is open, so it supplies it. Zod strips unknown
 * keys, so adding it to a command that takes no project is harmless.
 */
function withProjectId(args: unknown, projectId: string | undefined): unknown {
  if (!projectId || !args || typeof args !== 'object' || Array.isArray(args)) return args
  const record = args as Record<string, unknown>
  if (typeof record['projectId'] === 'string' && record['projectId']) return args
  return { ...record, projectId }
}

/**
 * What the model is told happened.
 *
 * A bare "Done." is too weak a signal: a model that cannot tell its call landed
 * re-issues it, and the observable result is the same object added to the canvas
 * twice. Naming the command and handing back the new id gives it something to
 * refer to instead.
 */
function summarize(commandId: string, data: unknown): string {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const id = record['shapeId'] ?? record['id']
  const idPart = typeof id === 'string' ? ` (id ${id})` : ''
  return `${commandId} completed${idPart}.`
}

async function fetchSurfaces(): Promise<Record<VoiceScreen, SerializedScope>> {
  const response = await fetch('/api/voice/surfaces', { cache: 'no-store' })
  const body = (await response.json()) as {
    ok?: boolean
    surfaces?: Record<VoiceScreen, SerializedScope>
  }
  if (!response.ok || !body.ok || !body.surfaces) throw new Error('surfaces unavailable')
  return body.surfaces
}
