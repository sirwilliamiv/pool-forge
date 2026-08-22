import { randomBytes } from 'node:crypto'

import {
  VOICE_CHANNELS,
  type SerializedScope,
  type VoiceStartRequest,
  type VoiceStartResult,
  type VoiceToolResultMessage,
} from '../bridge'
import { loadVoiceConfig, voiceEnabled, type EnvLike } from '../config'
import type { ScreenScope, VoiceScreen } from '../scope'
import { startVoiceSession, type CommandOutcome, type VoiceSession } from '../session'

// The desktop host.
//
// This is the process that may hold credentials, so it is the process that holds
// the socket to Vertex. It is deliberately thin: it moves audio, and it relays
// tool calls to the window, which runs them through the same `dispatch()` every
// button uses. It has no database client and no idea what a pool is.
//
// Bundled to CommonJS for the Electron main process; see `scripts/build-voice-host.mjs`.

/** The slice of Electron this needs, so the host is testable without Electron. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void
  on(channel: string, listener: (event: unknown, ...args: never[]) => void): void
}

export interface WebContentsLike {
  send(channel: string, ...args: unknown[]): void
}

export interface HostDeps {
  ipcMain: IpcMainLike
  /** The window to talk to, or null when there isn't one. */
  getWindow: () => WebContentsLike | null
  log?: (event: string, fields: Record<string, unknown>) => void
  /** Injected in tests. */
  startSession?: typeof startVoiceSession
  env?: EnvLike
}

/**
 * How long a tool call may take before the model is told it failed.
 *
 * The model is waiting mid-sentence, and a renderer that never answers would
 * otherwise leave the conversation hung with no way for the user to tell.
 */
const TOOL_TIMEOUT_MS = 20_000

export function installVoiceHost(deps: HostDeps): { dispose: () => Promise<void> } {
  const log = deps.log ?? (() => {})
  const start = deps.startSession ?? startVoiceSession
  const env = deps.env ?? process.env

  let session: VoiceSession | null = null
  let pendingTools = new Map<string, (outcome: CommandOutcome) => void>()

  function send(channel: string, ...args: unknown[]): void {
    deps.getWindow()?.send(channel, ...args)
  }

  /**
   * Ask the window to run a command.
   *
   * The renderer is the only place a command runs, so this resolves against a
   * reply rather than doing any work itself.
   */
  function runCommand(commandId: string, args: unknown): Promise<CommandOutcome> {
    const window = deps.getWindow()
    if (!window) {
      return Promise.resolve({ ok: false, summary: 'The app window is not open.' })
    }
    const requestId = randomBytes(8).toString('hex')
    return new Promise<CommandOutcome>(resolve => {
      const timer = setTimeout(() => {
        pendingTools.delete(requestId)
        log('voice_tool_timeout', { commandId })
        resolve({ ok: false, summary: `${commandId} did not finish in time.` })
      }, TOOL_TIMEOUT_MS)

      pendingTools.set(requestId, outcome => {
        clearTimeout(timer)
        pendingTools.delete(requestId)
        resolve(outcome)
      })

      window.send(VOICE_CHANNELS.toolCall, { requestId, commandId, args })
    })
  }

  async function stop(): Promise<void> {
    const current = session
    session = null
    for (const resolve of pendingTools.values()) {
      resolve({ ok: false, summary: 'The voice session ended.' })
    }
    pendingTools = new Map()
    await current?.close()
  }

  deps.ipcMain.handle(VOICE_CHANNELS.start, async (_event, ...args): Promise<VoiceStartResult> => {
    const request = args[0] as VoiceStartRequest | undefined
    if (!request) return { ok: false, error: 'Voice could not start.' }

    if (!voiceEnabled(env)) {
      // Named variables belong in the log, not on screen. A user reading this
      // cannot act on an env var name, and a screen that recites configuration
      // keys is one screen-share away from leaking the rest of the file.
      log('voice_disabled', {
        hasFlag: Boolean(env['VOICE_LIVE']),
        hasProject: Boolean(env['GCP_PROJECT_ID']),
      })
      return { ok: false, error: 'Voice is not set up on this machine yet.' }
    }

    await stop()

    try {
      const resolveScope = scopeResolver(request.surfaces)
      const options: Parameters<typeof start>[1] = {
        screen: request.screen,
        config: loadVoiceConfig(env),
        resolveScope,
      }
      if (request.projectId !== undefined) options.projectId = request.projectId

      session = await start(
        {
          onAudio: chunk => send(VOICE_CHANNELS.audioOut, toTransferable(chunk)),
          runCommand,
          onTranscript: (text, role) => send(VOICE_CHANNELS.transcript, { text, role }),
          onInterrupted: () => send(VOICE_CHANNELS.interrupted),
          onClosed: reason => {
            session = null
            send(VOICE_CHANNELS.closed, reason)
          },
          log,
        },
        options,
      )
      return { ok: true }
    } catch (error) {
      // Vertex errors carry project ids, quota detail and sometimes token
      // fragments. The user gets a sentence and a ref; the detail stays here.
      const ref = randomBytes(6).toString('hex')
      log('voice_start_failed', { ref, error: String(error).slice(0, 400) })
      return { ok: false, error: 'Voice could not start. Please try again.', ref: `err_${ref}` }
    }
  })

  deps.ipcMain.on(VOICE_CHANNELS.audio, (_event, ...args) => {
    const frame = args[0] as ArrayBuffer | undefined
    if (!frame || !session) return
    session.sendAudio(new Uint8Array(frame))
  })

  deps.ipcMain.on(VOICE_CHANNELS.screen, (_event, ...args) => {
    const screen = args[0] as VoiceScreen | undefined
    if (screen && session) session.setScreen(screen)
  })

  deps.ipcMain.on(VOICE_CHANNELS.toolResult, (_event, ...args) => {
    const message = args[0] as VoiceToolResultMessage | undefined
    if (!message) return
    pendingTools.get(message.requestId)?.(message.outcome)
  })

  deps.ipcMain.handle(VOICE_CHANNELS.stop, async () => {
    await stop()
  })

  return { dispose: stop }
}

/**
 * Rebuild `ScreenScope` from what the renderer sent.
 *
 * The membership test is derived here rather than trusted from the wire: `allows`
 * is what every tool call is re-checked against, so it has to agree exactly with
 * the surface the model was actually handed.
 */
function scopeResolver(
  surfaces: Record<VoiceScreen, SerializedScope>,
): (screen: VoiceScreen) => ScreenScope {
  const cache = new Map<VoiceScreen, ScreenScope>()
  return screen => {
    const existing = cache.get(screen)
    if (existing) return existing

    const sent = surfaces[screen]
    const surface = sent?.surface ?? { tools: [], refused: [] }
    const allowed = new Set(surface.tools.map(tool => tool.name))
    const scope: ScreenScope = {
      screen,
      categories: sent?.categories ?? [],
      surface,
      allows: commandId => allowed.has(commandId),
    }
    cache.set(screen, scope)
    return scope
  }
}

/**
 * Copy into a standalone ArrayBuffer before it crosses the IPC boundary.
 *
 * A Uint8Array view over a pooled Node Buffer would otherwise serialize the
 * whole underlying pool, which is both wrong and much larger than the frame.
 */
function toTransferable(chunk: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(chunk.byteLength)
  copy.set(chunk)
  return copy.buffer
}
