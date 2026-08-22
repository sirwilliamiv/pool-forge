import type { CommandCategory } from '@/modules/commands/registry'

import { loadVoiceConfig, MAX_BUFFERED_FRAMES, type VoiceConfig } from './config'
import { scopeFor, type ScreenScope, type VoiceScreen } from './scope'
import { isDestructive } from './tools'

// The conversation.
//
// Transport-agnostic on purpose: this same object runs inside the Electron main
// process today and inside a small ws service later. It is handed a way to reach
// the client and it owns everything between the microphone and the model.
//
// It executes nothing. When the model calls a tool this asks the client to run
// it, because the client already has `dispatch()`, which updates the editor
// store and writes the audit row. Executing here would mean a second path that
// silently diverges from the one every button uses, and a screen that sits stale
// until something refetches.

/** What the host must provide. Everything else is this module's business. */
export interface SessionHost {
  /** Model audio, PCM16 at 24 kHz, for the host to play. */
  onAudio(chunk: Uint8Array): void
  /** Ask the client to run a command and report the result. */
  runCommand(commandId: string, args: unknown): Promise<CommandOutcome>
  /** Model transcript, for on-screen captions. */
  onTranscript?(text: string, role: 'user' | 'model'): void
  /** The model was cut off. Stop playback and drop anything queued. */
  onInterrupted?(): void
  /** Terminal: the session is over and will not resume. */
  onClosed?(reason: string): void
  /** Structured logging hook, so this module never reaches for console directly. */
  log?(event: string, fields: Record<string, unknown>): void
}

export interface CommandOutcome {
  ok: boolean
  /** Returned to the model. Keep it short: it is about to be read aloud. */
  summary: string
  data?: unknown
}

export interface SessionOptions {
  screen: VoiceScreen
  /** Bound at connect and never taken from the wire afterwards. */
  projectId?: string
  config?: VoiceConfig
  /** Injected so tests can drive the whole session without a network. */
  connect?: LiveConnect
}

/** The slice of the Live API this module uses, so it can be faked in tests. */
export interface LiveSession {
  sendRealtimeInput(input: { audio?: { data: string; mimeType: string }; audioStreamEnd?: boolean }): void
  sendToolResponse(response: { functionResponses: FunctionResponse[] }): void
  close(): void
}

export interface FunctionResponse {
  id?: string
  name: string
  response: Record<string, unknown>
}

export interface LiveConnect {
  (params: {
    model: string
    config: Record<string, unknown>
    callbacks: {
      onopen: () => void
      onmessage: (message: LiveServerMessageLike) => void
      onerror: (error: unknown) => void
      onclose: (event: { reason?: string }) => void
    }
  }): Promise<LiveSession>
}

/** The message shape this module reads. The SDK's type is far wider. */
export interface LiveServerMessageLike {
  setupComplete?: unknown
  serverContent?: {
    interrupted?: boolean
    turnComplete?: boolean
    modelTurn?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] }
    outputTranscription?: { text?: string }
    inputTranscription?: { text?: string }
  }
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[] }
  goAway?: { timeLeft?: string }
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean }
}

const SYSTEM_PROMPT = `You are the voice assistant inside Pool Forge, software pool builders use to design a pool, price it, and produce a proposal.

You act by calling tools. Never claim to have done something you did not call a tool for.

How to behave:
- Be brief. This is spoken, so one or two sentences, no lists, no markdown.
- Use the units a builder uses: feet and inches, never metres.
- When a request is ambiguous, ask rather than guess. Opening the wrong customer's job or resizing the wrong pool costs more than a question.
- If a tool fails, say plainly what went wrong. Do not retry the same call hoping for a different answer.
- You only have the tools for the screen the user is on. If something is not available here, say so and offer to navigate there instead of pretending.
- Before anything destructive, say exactly what will be lost and wait for a clear yes.`

export interface VoiceSession {
  /** Microphone audio, PCM16 at 16 kHz. */
  sendAudio(chunk: Uint8Array): void
  /** The microphone was turned off. */
  endAudio(): void
  /** Move to a different screen: swaps the toolset mid-conversation. */
  setScreen(screen: VoiceScreen): void
  close(): Promise<void>
  readonly scope: ScreenScope
  readonly categories: CommandCategory[]
}

/**
 * Open a session.
 *
 * The returned object is the whole public surface: push audio in, and the host's
 * callbacks receive audio, transcripts and tool requests.
 */
export async function startVoiceSession(
  host: SessionHost,
  options: SessionOptions,
): Promise<VoiceSession> {
  const config = options.config ?? loadVoiceConfig()
  const log = host.log ?? (() => {})

  let scope = scopeFor(options.screen)
  let live: LiveSession | null = null
  let closed = false
  let resumptionHandle: string | undefined
  /** Frames captured before the socket is ready, capped so a stall cannot grow. */
  const pending: Uint8Array[] = []
  /** Set when the model has proposed something destructive and awaits a yes. */
  let awaitingConfirmation: { commandId: string; args: unknown } | null = null

  const connect: LiveConnect = options.connect ?? (await defaultConnect(config))

  function liveConfig(): Record<string, unknown> {
    return {
      responseModalities: ['AUDIO'],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      tools: [{ functionDeclarations: scope.surface.tools }],
      // Resumption is what lets a dropped socket or a server-side GoAway look
      // like nothing happened. The handle never leaves this process.
      sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
      // A builder talking through a whole job will outrun the window otherwise.
      contextWindowCompression: { slidingWindow: {} },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    }
  }

  async function handleToolCall(call: { id?: string; name?: string; args?: Record<string, unknown> }) {
    const name = call.name ?? ''
    const args = call.args ?? {}

    // Re-checked here even though the model was handed a scoped surface. It can
    // hallucinate a name, or reach for a tool from a screen the user has since
    // left, and the surface it was given is not a guarantee about what it sends.
    if (!scope.allows(name)) {
      log('voice_tool_out_of_scope', { name, screen: scope.screen })
      return respond(call, {
        ok: false,
        summary: `${name} is not available on this screen.`,
      })
    }

    // Destructive commands do not run on first hearing. Voice misrecognition
    // plus an apply or a delete is how a drawing disappears, so the model is
    // told to confirm out loud and the call only lands on the second pass.
    if (isDestructive(name) && !isConfirmed(args)) {
      awaitingConfirmation = { commandId: name, args }
      log('voice_awaiting_confirmation', { name })
      return respond(call, {
        ok: false,
        summary:
          'This will change or remove work that cannot be recovered. Tell the user exactly what will be lost, and call this again with confirm set to true only after they clearly agree.',
      })
    }

    if (awaitingConfirmation?.commandId === name) awaitingConfirmation = null

    try {
      const outcome = await host.runCommand(name, args)
      log('voice_tool_ran', { name, ok: outcome.ok })
      return respond(call, outcome)
    } catch (error) {
      // The model reads this aloud, so it must be a sentence, and it must never
      // carry provider or stack detail.
      log('voice_tool_threw', { name, error: String(error).slice(0, 200) })
      return respond(call, { ok: false, summary: `${name} could not be completed.` })
    }
  }

  function respond(
    call: { id?: string; name?: string },
    outcome: CommandOutcome,
  ): void {
    if (!live || closed) return
    const response: FunctionResponse = {
      name: call.name ?? 'unknown',
      response: { ok: outcome.ok, summary: outcome.summary, ...(outcome.data ? { data: outcome.data } : {}) },
    }
    if (call.id !== undefined) response.id = call.id
    live.sendToolResponse({ functionResponses: [response] })
  }

  function onMessage(message: LiveServerMessageLike): void {
    if (message.setupComplete) {
      log('voice_ready', { screen: scope.screen, tools: scope.surface.tools.length })
      flushPending()
    }

    const content = message.serverContent
    if (content?.interrupted) {
      // Barge-in. Anything already queued for playback is now stale.
      host.onInterrupted?.()
    }
    for (const part of content?.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data
      if (data) host.onAudio(base64ToBytes(data))
      if (part.text) host.onTranscript?.(part.text, 'model')
    }
    if (content?.outputTranscription?.text) {
      host.onTranscript?.(content.outputTranscription.text, 'model')
    }
    if (content?.inputTranscription?.text) {
      host.onTranscript?.(content.inputTranscription.text, 'user')
    }

    for (const call of message.toolCall?.functionCalls ?? []) {
      void handleToolCall(call)
    }

    if (message.sessionResumptionUpdate?.newHandle) {
      resumptionHandle = message.sessionResumptionUpdate.newHandle
    }

    if (message.goAway) {
      // A warning, not a disconnect: reconnect on the handle before the server
      // closes, so the user never notices a boundary they did not cause.
      log('voice_go_away', { timeLeft: message.goAway.timeLeft ?? 'unknown' })
      void reconnect('server asked us to move')
    }
  }

  function flushPending(): void {
    if (!live) return
    while (pending.length > 0) {
      const frame = pending.shift()
      if (frame) live.sendRealtimeInput({ audio: { data: bytesToBase64(frame), mimeType: 'audio/pcm;rate=16000' } })
    }
  }

  async function open(): Promise<void> {
    live = await connect({
      model: config.model,
      config: liveConfig(),
      callbacks: {
        onopen: () => log('voice_open', { model: config.model }),
        onmessage: onMessage,
        onerror: error => log('voice_error', { error: String(error).slice(0, 200) }),
        onclose: event => {
          if (closed) return
          // An unexpected close is recoverable while a handle exists.
          void reconnect(event.reason ?? 'socket closed')
        },
      },
    })
  }

  async function reconnect(reason: string): Promise<void> {
    if (closed) return
    log('voice_reconnecting', { reason, hasHandle: Boolean(resumptionHandle) })
    try {
      live?.close()
    } catch {
      // Already gone; the point was to stop it delivering more messages.
    }
    live = null
    try {
      await open()
    } catch (error) {
      closed = true
      log('voice_reconnect_failed', { error: String(error).slice(0, 200) })
      host.onClosed?.('The voice session ended and could not be restarted.')
    }
  }

  await open()

  return {
    sendAudio(chunk) {
      if (closed) return
      if (!live) {
        // Cap the pre-connect buffer: audio is only useful fresh, and an
        // unbounded queue turns a brief stall into a permanently delayed
        // conversation.
        pending.push(chunk)
        while (pending.length > MAX_BUFFERED_FRAMES) pending.shift()
        return
      }
      live.sendRealtimeInput({ audio: { data: bytesToBase64(chunk), mimeType: 'audio/pcm;rate=16000' } })
    },
    endAudio() {
      live?.sendRealtimeInput({ audioStreamEnd: true })
    },
    setScreen(next) {
      if (next === scope.screen) return
      scope = scopeFor(next)
      log('voice_screen_changed', { screen: next, tools: scope.surface.tools.length })
      // The tool surface is fixed at connect, so changing it means reconnecting.
      // The resumption handle carries the conversation across, so the user keeps
      // their context and only the available actions change.
      void reconnect('screen changed')
    },
    async close() {
      closed = true
      try {
        live?.close()
      } finally {
        live = null
        host.onClosed?.('closed by the user')
      }
    },
    get scope() {
      return scope
    },
    get categories() {
      return scope.categories
    },
  }
}

/** A confirmation flag the model set after checking with the user. */
function isConfirmed(args: unknown): boolean {
  if (!args || typeof args !== 'object') return false
  const record = args as Record<string, unknown>
  return record['confirm'] === true || record['confirmReplace'] === true
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

/**
 * The real Vertex connection, loaded only when no fake was injected.
 *
 * Imported lazily so the module stays usable in tests and in any process that
 * has no credentials, and so the SDK is not pulled into a bundle that never
 * opens a session.
 */
async function defaultConnect(config: VoiceConfig): Promise<LiveConnect> {
  const { GoogleGenAI } = await import('@google/genai')
  const client = new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: config.location,
  })
  return params =>
    client.live.connect(params as never) as unknown as Promise<LiveSession>
}
