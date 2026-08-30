'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { dispatch } from '@/lib/commands/dispatch'
import { readPage } from '@/modules/editor/page-read'
import { useGuideStore } from '@/modules/guide/store'

import {
  getVoiceBridge,
  type SerializedScope,
  type VoiceBridge,
  type VoiceStartRequest,
  type VoiceToolCallEvent,
} from '../bridge'
import type { VoiceScreen } from '../scope'
import type { DestructiveRequest } from '@/components/voice/DestructiveConfirm'
import { isDestructive } from '../tools'
import { startCapture, VoicePlayback, type CaptureHandle } from './audio'
import { clearJournal, readJournal, recordCommand, recordSummary, setJournalIdentity } from './journal'
import { useVoiceLiveStore } from './liveStore'
import { createWebSocketBridge, relayUrl } from './wsBridge'

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
  /**
   * Set while a destructive action waits on the user.
   *
   * Null the rest of the time. The dock renders a dialog from it and answers
   * through `decide`, which is what unblocks the command.
   */
  pendingConfirm: DestructiveRequest | null
  decide: (allowed: boolean) => void
  /** Safe to display. Never provider text. */
  error: string | null
  transcript: TranscriptLine[]
  /** Call from a click handler. Anything else and the microphone stays silent. */
  start: () => Promise<void>
  stop: () => Promise<void>
}

/** How many lines of transcript to keep on screen. */
const TRANSCRIPT_LIMIT = 40

/**
 * How long a session may sit with nobody saying anything, in milliseconds.
 *
 * A live session holds the microphone open and bills for every minute of it
 * against a per-organisation budget, so one left running because a builder put
 * the laptop down and went to look at a pump is a cost and an open microphone
 * nobody meant to leave open. Two minutes is long enough to think and short
 * enough that walking away ends it.
 */
const IDLE_LIMIT_MS = 120_000

/** How long before that the user is warned, so it is never a silent cut. */
const IDLE_WARNING_MS = 30_000

/**
 * A short read of what is currently rendered, for the model to open with.
 *
 * The same `readPage` behind the `page.read` tool, so this is exactly what the
 * model could ask for itself; the difference is only that it arrives at
 * connect and at every screen change instead of waiting to be asked.
 * Never throws: a page that cannot be read yet (mid-navigation, no document)
 * is a session that opens with one sentence less context, not a broken start.
 */
function pageSnapshot(): string {
  try {
    const page = readPage()
    const headings = page.headings.slice(0, 6).join('; ')
    const actions = page.actions.slice(0, 12).map(action => action.label).join(', ')
    return `${page.title}. Sections: ${headings}. Actions: ${actions}.`.slice(0, 800)
  } catch {
    return ''
  }
}

export function useVoiceSession(
  screen: VoiceScreen,
  projectId?: string,
  projectName?: string,
  /**
   * `${orgId}:${userId}` of whoever is signed in, so the journal is keyed to
   * them rather than to the tab. Omitted in tests and in any caller that has
   * not threaded identity through yet, which is safe: an unkeyed journal
   * still works, it just is not isolated from the next identity to use this
   * tab, which is exactly the case this parameter exists to close in the app
   * shell (see VoiceDock).
   */
  identity?: string,
): UseVoiceSession {
  const bridge = useRef<VoiceBridge | null>(null)
  const capture = useRef<CaptureHandle | null>(null)
  const playback = useRef<VoicePlayback | null>(null)
  const unsubscribes = useRef<(() => void)[]>([])
  /** The budget slot this session holds, released on stop. */
  const budgetId = useRef<string | null>(null)
  const lineId = useRef(0)

  const [status, setStatus] = useState<VoiceStatus>('unavailable')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [pendingConfirm, setPendingConfirm] = useState<DestructiveRequest | null>(null)

  /** Resolves when the user answers the dialog. */
  const decision = useRef<((allowed: boolean) => void) | null>(null)
  /** Off means fall back to the spoken gate; on is the default and the safe one. */
  const confirmDestructive = useRef(true)

  const decide = useCallback((allowed: boolean) => {
    setPendingConfirm(null)
    const resolve = decision.current
    decision.current = null
    resolve?.(allowed)
  }, [])

  /**
   * Ask the user, and wait.
   *
   * The promise is what makes this a gate rather than a notification: the tool
   * call does not resolve until somebody clicks, so the model cannot proceed on
   * the assumption that it will be allowed.
   */
  const askUser = useCallback((request: DestructiveRequest): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      // A second request while one is open cancels the first rather than
      // queueing it. Two stacked dialogs is how somebody confirms the wrong one.
      decision.current?.(false)
      decision.current = resolve
      setPendingConfirm(request)
    })
  }, [])

  useEffect(() => {
    // The desktop build exposes a bridge on `window`; the web build reaches the
    // relay over a socket. Neither is checked for here beyond "is one available",
    // which is the whole reason both satisfy the same interface.
    const local = getVoiceBridge()
    if (local) {
      bridge.current = local
      setStatus('idle')
      return
    }
    setStatus(relayUrl() ? 'idle' : 'unavailable')
  }, [])

  // Keyed to whoever is signed in, so a journal written by one identity is
  // stored at a different sessionStorage slot than any other identity's and
  // is never read back as "context from earlier in this session" for
  // somebody else on a shared machine. Set on every render rather than in an
  // effect: it must be current before the very first `readJournal()` call in
  // `start()`, and setting a module-level string is not a side effect React
  // needs to sequence.
  if (identity !== undefined) setJournalIdentity(identity)

  /**
   * The journal belongs to one project, not to the tab.
   *
   * sessionStorage survives exactly as long as the tab, which also survives
   * navigating from project A to project B. Left alone, ending a session on A
   * and starting a new one on B would hand the model A's actions framed as
   * "context from earlier in this session" for a project it has nothing to do
   * with. Cleared on an actual transition between two different project
   * identities only: the ref starts uninitialized so the very first render
   * (a fresh mount, or a reload that is meant to keep the journal) never
   * counts as a switch.
   */
  const previousProjectId = useRef<string | undefined>(undefined)
  const projectIdSeen = useRef(false)
  useEffect(() => {
    if (!projectIdSeen.current) {
      projectIdSeen.current = true
      previousProjectId.current = projectId
      return
    }
    if (projectId !== previousProjectId.current) {
      clearJournal()
    }
    previousProjectId.current = projectId
  }, [projectId])

  // Set when a turn ends, so the next fragment starts a new caption line rather
  // than continuing the last answer's sentence.
  const startNewLine = useRef(false)

  /** Set once `touchIdle` exists, so `addLine` can reach it from above. */
  const touchIdleRef = useRef<(() => void) | null>(null)

  /**
   * The model line as heard so far this turn, kept outside React state so the
   * journal can be updated synchronously alongside the transcript rather than
   * waiting a render behind it.
   */
  const lastModelText = useRef('')

  const addLine = useCallback((role: 'user' | 'model', text: string) => {
    if (!text.trim()) return
    // A long answer is not an idle session, and neither is a long question, so
    // both directions count.
    touchIdleRef.current?.()
    setTranscript(previous => {
      const last = previous[previous.length - 1]
      // The Live API streams transcription in fragments. Appending to the last
      // line of the same speaker reads as speech; one line per fragment reads as
      // a stutter.
      if (last?.role === role && !startNewLine.current) {
        const merged = [...previous]
        const mergedLine = { ...last, text: last.text + text }
        merged[merged.length - 1] = mergedLine
        if (role === 'model') lastModelText.current = mergedLine.text
        return merged.slice(-TRANSCRIPT_LIMIT)
      }
      startNewLine.current = false
      lineId.current += 1
      if (role === 'model') lastModelText.current = text
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

  const releaseBudget = useCallback(async () => {
    const held = budgetId.current
    budgetId.current = null
    // Fire and forget on the way out: a failed release costs a slot for the
    // staleness window, where blocking teardown on it would leave the microphone
    // open while the request retried.
    if (held) void dispatch('voice.session.end', { sessionId: held })
  }, [])

  /**
   * End a session nobody is using.
   *
   * Reset on anything anybody says, in either direction: a long answer is not
   * an idle session, and neither is a long question.
   */
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearIdleTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (warnTimer.current) clearTimeout(warnTimer.current)
    idleTimer.current = null
    warnTimer.current = null
  }, [])

  const stop = useCallback(async () => {
    clearIdleTimers()
    await teardown()
    await bridge.current?.stop()
    await releaseBudget()
    setStatus(bridge.current ? 'idle' : 'unavailable')
  }, [clearIdleTimers, releaseBudget, teardown])

  /** Restart the countdown. Called on every turn, in either direction. */
  const touchIdle = useCallback(() => {
    clearIdleTimers()
    warnTimer.current = setTimeout(() => {
      // Said, not silently done. A session that ends without warning reads as a
      // dropped connection, and the next thing somebody does is press the
      // button again and wonder why it keeps failing.
      setError('Still there? This will close in thirty seconds.')
    }, IDLE_LIMIT_MS - IDLE_WARNING_MS)
    idleTimer.current = setTimeout(() => {
      setError('Closed after two minutes with nothing said. Press Marco to start again.')
      void stop()
    }, IDLE_LIMIT_MS)
  }, [clearIdleTimers, stop])
  touchIdleRef.current = touchIdle

  const start = useCallback(async () => {
    if (status === 'live' || status === 'starting') return

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
      // Buffered until the transport exists: capture has to start inside the
      // click, and the socket cannot be opened until the budget is claimed.
      started = await startCapture(frame => bridge.current?.sendAudio(frame))
    } catch {
      await teardown()
      setStatus('error')
      setError('Pool Forge could not use the microphone. Check the permission and try again.')
      return
    }
    capture.current = started

    // Claim a session slot before opening a socket. A Live session bills
    // continuously for as long as it is open, so the ceiling has to be checked
    // before the meter starts, not after.
    const budget = await dispatch<Record<string, never>, {
      allowed: boolean
      sessionId: string | null
      message: string | null
    }>('voice.session.begin', {})

    if (!budget.ok || !budget.data.allowed) {
      await teardown()
      setStatus('idle')
      setError(
        budget.ok
          ? (budget.data.message ?? 'Voice is not available right now.')
          : 'Voice could not start.',
      )
      return
    }
    const sessionId = budget.data.sessionId
    if (!sessionId) {
      await teardown()
      setStatus('error')
      setError('Voice could not start.')
      return
    }
    budgetId.current = sessionId

    // Built after the budget is claimed, because the ticket names the session it
    // is allowed to spend and is only valid for a minute.
    const current =
      bridge.current ??
      (await createWebSocketBridge(() => fetchTicket(sessionId, projectId, projectName)))

    if (!current) {
      await teardown()
      await releaseBudget()
      setStatus('unavailable')
      return
    }
    bridge.current = current

    let surfaces: Record<VoiceScreen, SerializedScope>
    try {
      const loaded = await fetchSurfaces()
      surfaces = loaded.surfaces
      confirmDestructive.current = loaded.settings.confirmDestructive
    } catch {
      await teardown()
      await releaseBudget()
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
      current.onTranscript(event => {
        // A new question about the page makes the last answer's rings stale.
        if (event.role === 'user') useGuideStore.getState().clear()
        addLine(event.role, event.text)
        // Cheap and good enough: overwrite the journal's one-line summary with
        // what the model has said so far this turn. The last fragment before
        // turnComplete leaves the whole sentence in place, not a smarter recap.
        if (event.role === 'model') recordSummary(`Last exchange: ${lastModelText.current}`)
      }),
      current.onClosed(reason => {
        void teardown()
        void releaseBudget()
        setStatus('idle')
        setError(reason)
      }),
      current.onToolCall(event => {
        void runToolCall(current, event, projectId, {
          enabled: () => confirmDestructive.current,
          ask: askUser,
        })
      }),
    ]

    const request: VoiceStartRequest = { screen, surfaces }
    if (projectId !== undefined) request.projectId = projectId
    if (projectName !== undefined) request.projectName = projectName
    const summary = pageSnapshot()
    if (summary) request.pageSummary = summary
    const journal = readJournal()
    if (journal) request.journal = journal
    const result = await current.start(request)

    if (!result.ok) {
      await teardown()
      await releaseBudget()
      setStatus('error')
      setError(result.ref ? `${result.error ?? 'Voice could not start.'} (${result.ref})` : result.error ?? 'Voice could not start.')
      return
    }

    setStatus('live')
    // Armed from the moment it opens, so a session nobody speaks into at all
    // still ends rather than holding the microphone until the tab closes.
    // Through the ref, like `addLine`: naming it as a dependency would rebuild
    // `start` on every render, and `start` is bound to a click handler.
    touchIdleRef.current?.()
  }, [addLine, askUser, projectId, projectName, releaseBudget, screen, status, teardown])

  // Moving between screens swaps what the agent can do, and moving between
  // projects swaps what it is talking about. Both without ending the call.
  useEffect(() => {
    if (status !== 'live') return
    // Deferred a frame: this effect fires the moment the screen or project
    // prop changes, which can be before the new route has actually painted.
    // A snapshot taken then reads the page that is on its way out.
    const frame = requestAnimationFrame(() => {
      const context: { projectId?: string; projectName?: string; pageSummary?: string } = {}
      if (projectId !== undefined) context.projectId = projectId
      if (projectName !== undefined) context.projectName = projectName
      const summary = pageSnapshot()
      if (summary) context.pageSummary = summary
      bridge.current?.setScreen(screen, context)
    })
    return () => cancelAnimationFrame(frame)
  }, [projectId, projectName, screen, status])

  // Mirrored to the shared store so surfaces the dock never touches (the
  // editor's live border) can follow the session without prop-threading
  // through the app shell. Reset on unmount, or a dead dock leaves the app
  // looking live.
  useEffect(() => {
    useVoiceLiveStore.getState().setStatus(status)
  }, [status])
  useEffect(() => {
    return () => useVoiceLiveStore.getState().setStatus('unavailable')
  }, [])

  // A session outlives the component only as a bill, so end it on unmount.
  useEffect(() => {
    return () => {
      void teardown()
      void bridge.current?.stop()
      void releaseBudget()
    }
  }, [releaseBudget, teardown])

  return { status, error, transcript, start, stop, pendingConfirm, decide }
}

/** How the dialog is reached from a tool call. */
export interface ConfirmGate {
  enabled: () => boolean
  ask: (request: DestructiveRequest) => Promise<boolean>
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
  gate: ConfirmGate,
): Promise<void> {
  try {
    // The last gate before anything is removed, and the only one the model
    // cannot write itself. The spoken confirmation is the agent deciding the
    // user agreed, from audio it may have misheard; this is the user.
    if (gate.enabled() && isDestructive(event.commandId, event.args)) {
      const allowed = await gate.ask({
        commandId: event.commandId,
        summary: describeDestructive(event.commandId, event.args),
      })
      if (!allowed) {
        bridge.respond({
          requestId: event.requestId,
          outcome: {
            ok: false,
            summary: 'The user cancelled it. Do not try again unless they ask.',
          },
        })
        return
      }
    }

    // Labelled VOICE so the audit log can answer "what did the agent actually
    // do, and did it work" — which is the whole basis of evaluating it.
    const result = await dispatch(event.commandId, withProjectId(event.args, projectId), 'VOICE')
    if (result.ok) {
      const spoken = summarize(event.commandId, result.data)
      // Same spoken summary the model hears, kept so a reload or a reconnect
      // opens already knowing what just happened.
      recordCommand(event.commandId, spoken)
      bridge.respond({
        requestId: event.requestId,
        outcome: { ok: true, summary: spoken, data: result.data },
      })
    } else {
      bridge.respond({
        requestId: event.requestId,
        outcome: { ok: false, summary: result.error },
      })
    }
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
 * re-issues it, and the observable result is the same object added twice. But
 * naming the command is not enough either. Watching a real session, undo
 * reported only "edit.undo completed" three times in a row, so the model could
 * not tell whether it had gone back one step or three, retried the add, and ran
 * add-add-add-undo-undo-undo round and round.
 *
 * So the outcome carries the numbers that say where things now stand.
 */
function summarize(commandId: string, data: unknown): string {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const parts: string[] = []

  const id = record['shapeId'] ?? record['id']
  if (typeof id === 'string' && id) parts.push(`id ${id}`)

  // Undo and redo are the ones that were unreadable, and the state after them is
  // the only thing that makes the next decision obvious.
  if (record['undone'] === true) parts.push('undone')
  if (record['undone'] === false) parts.push('there was nothing to undo')
  if (record['redone'] === true) parts.push('redone')
  if (record['redone'] === false) parts.push('there was nothing to redo')
  if (typeof record['shapeCount'] === 'number') {
    parts.push(`${record['shapeCount']} object${record['shapeCount'] === 1 ? '' : 's'} on the canvas now`)
  }

  if (Array.isArray(record['deletedNames']) && record['deletedNames'].length > 0) {
    parts.push(`removed ${record['deletedNames'].join(', ')}`)
  }
  if (typeof record['count'] === 'number') parts.push(`${record['count']} found`)
  if (typeof record['filled'] === 'number') parts.push(`${record['filled']} field(s) filled`)
  if (typeof record['total'] === 'number') parts.push(`total ${record['total']}`)

  return parts.length > 0 ? `${commandId}: ${parts.join(', ')}.` : `${commandId} completed.`
}

/**
 * A pass for the relay socket.
 *
 * Minted by the app, which knows the session; checked by the relay, which does
 * not and should not need to.
 */
async function fetchTicket(
  sessionId: string,
  projectId: string | undefined,
  projectName: string | undefined,
): Promise<string> {
  const response = await fetch('/api/voice/ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, projectId, projectName }),
  })
  const body = (await response.json()) as { ok?: boolean; ticket?: string }
  if (!response.ok || !body.ok || !body.ticket) throw new Error('no ticket')
  return body.ticket
}

/**
 * What the dialog says is about to happen.
 *
 * Named rather than generic: "are you sure?" is a question nobody can answer,
 * and the whole reason this dialog exists is that the user was never told what
 * was going.
 */
function describeDestructive(commandId: string, args: unknown): string {
  const record = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}

  if (commandId === 'page.click' && typeof record['label'] === 'string') {
    return `Press "${record['label']}" on this page. Whatever that removes cannot be brought back with undo.`
  }
  if (commandId === 'delete.shape' && Array.isArray(record['ids'])) {
    const count = record['ids'].length
    return `Remove ${count} object${count === 1 ? '' : 's'} from the drawing.`
  }
  if (commandId === 'template.scene.apply') {
    return 'Replace everything on this sheet with a saved scene.'
  }
  if (commandId === 'import.intent.apply') {
    return 'Write the imported design into this project, replacing what is there.'
  }
  return `Run ${commandId}, which removes or replaces work that cannot be recovered.`
}

async function fetchSurfaces(): Promise<{
  surfaces: Record<VoiceScreen, SerializedScope>
  settings: { confirmDestructive: boolean }
}> {
  const response = await fetch('/api/voice/surfaces', { cache: 'no-store' })
  const body = (await response.json()) as {
    ok?: boolean
    surfaces?: Record<VoiceScreen, SerializedScope>
    settings?: { confirmDestructive?: boolean }
  }
  if (!response.ok || !body.ok || !body.surfaces) throw new Error('surfaces unavailable')
  return {
    surfaces: body.surfaces,
    // Absent means on. A settings read that half worked must not be the thing
    // that turns the confirmation off.
    settings: { confirmDestructive: body.settings?.confirmDestructive !== false },
  }
}
