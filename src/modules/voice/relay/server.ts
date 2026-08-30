import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { WebSocketServer, type WebSocket } from 'ws'

import {
  VOICE_CHANNELS,
  type SerializedScope,
  type VoiceScreenMessage,
  type VoiceStartRequest,
  type VoiceToolResultMessage,
} from '../bridge'
import { loadVoiceConfig, voiceEnabled } from '../config'
import type { ScreenScope, VoiceScreen } from '../scope'
import { startVoiceSession, type CommandOutcome, type VoiceSession } from '../session'
import { ticketSecret, verifyTicket } from '../ticket'

// The relay.
//
// The browser cannot talk to Vertex: ephemeral tokens are a Gemini Developer API
// feature and Vertex has none, and Vertex auth is ADC, which must never reach a
// browser. So a relay is not a design preference, it is the only shape this can
// take, and the remaining decisions are about what it carries.
//
// It carries audio and routing, and nothing else. The browser still executes
// every tool call through its own `dispatch()`, so there is one execution path
// rather than two, and this process needs no database, no Prisma client and no
// org-scoping logic of its own to get wrong.
//
// The conversation is `startVoiceSession`, unchanged — the same object the
// Electron host runs. That is the whole point of the session core being
// transport-agnostic: a second transport is a socket and a message shape, not a
// second implementation of the agent.

export interface RelayOptions {
  port: number
  /** Injected in tests. */
  secret?: string
}

/** Frames older than this are dropped rather than queued. Audio is only useful fresh. */
const MAX_MESSAGE_BYTES = 1_000_000

/** A socket that never authenticates is a socket holding a slot for nothing. */
const AUTH_TIMEOUT_MS = 10_000

interface Pending {
  resolve: (outcome: CommandOutcome) => void
  timer: ReturnType<typeof setTimeout>
}

/** How long a browser has to run one command before the model is told it failed. */
const TOOL_TIMEOUT_MS = 20_000

export function startRelay(options: RelayOptions): { close: () => Promise<void> } {
  const secret = options.secret ?? ticketSecret()

  // Best-effort replay protection. A ticket lives sixty seconds, so this stays
  // small; it is per-instance, which is stated rather than pretended otherwise.
  // The real ceiling is the database-backed session budget, which is atomic.
  const seenTickets = new Set<string>()
  setInterval(() => seenTickets.clear(), 5 * 60_000).unref?.()

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Not /healthz: on Cloud Run the front end intercepts that path with its own
    // 404 before the request reaches the container.
    if (req.url === '/readyz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }
    res.writeHead(404)
    res.end()
  })

  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES })

  wss.on('connection', (socket, request) => {
    void handleConnection(socket, request, secret, seenTickets)
  })

  http.listen(options.port)

  return {
    close: () =>
      new Promise<void>(resolve => {
        wss.close(() => http.close(() => resolve()))
      }),
  }
}

async function handleConnection(
  socket: WebSocket,
  request: IncomingMessage,
  secret: string,
  seenTickets: Set<string>,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://relay')
  const token = url.searchParams.get('ticket') ?? ''

  const verified = verifyTicket(token, secret, seenTickets)
  if (!verified.ok) {
    // The reason is logged, never sent: telling a caller whether a signature was
    // wrong or merely expired is a hint it should not have.
    console.log(`[relay] rejected connection: ${verified.reason}`)
    socket.close(4001, 'unauthorized')
    return
  }

  if (!voiceEnabled()) {
    socket.close(4003, 'unavailable')
    return
  }

  const { ticket } = verified
  let session: VoiceSession | null = null
  let pending = new Map<string, Pending>()
  let nextRequest = 0

  const send = (channel: string, payload?: unknown): void => {
    if (socket.readyState !== socket.OPEN) return
    socket.send(JSON.stringify({ channel, payload }))
  }

  // The socket must authenticate and start promptly. One that connects and says
  // nothing is holding a session slot for nothing.
  const idleTimer = setTimeout(() => {
    if (!session) socket.close(4008, 'no start')
  }, AUTH_TIMEOUT_MS)

  const runCommand = (commandId: string, args: unknown): Promise<CommandOutcome> =>
    new Promise<CommandOutcome>(resolve => {
      const requestId = `r${nextRequest++}`
      const timer = setTimeout(() => {
        pending.delete(requestId)
        resolve({ ok: false, summary: `${commandId} did not finish in time.` })
      }, TOOL_TIMEOUT_MS)

      pending.set(requestId, { resolve, timer })
      send(VOICE_CHANNELS.toolCall, { requestId, commandId, args })
    })

  const shutdown = async (): Promise<void> => {
    clearTimeout(idleTimer)
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.resolve({ ok: false, summary: 'The voice session ended.' })
    }
    pending = new Map()
    const current = session
    session = null
    await current?.close()
  }

  socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    void onMessage(raw)
  })

  socket.on('close', () => {
    void shutdown()
  })

  socket.on('error', () => {
    void shutdown()
  })

  async function onMessage(raw: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    let message: { channel?: string; payload?: unknown }
    try {
      message = JSON.parse(String(raw)) as { channel?: string; payload?: unknown }
    } catch {
      return
    }

    switch (message.channel) {
      case VOICE_CHANNELS.start: {
        if (session) return
        clearTimeout(idleTimer)
        await open(message.payload as VoiceStartRequest | undefined)
        return
      }

      case VOICE_CHANNELS.audio: {
        // Base64 rather than binary frames: one message shape for everything
        // keeps the browser and the relay reading the same envelope, and the
        // encoding cost is trivial next to the model call.
        const encoded = message.payload
        if (typeof encoded !== 'string' || !session) return
        session.sendAudio(new Uint8Array(Buffer.from(encoded, 'base64')))
        return
      }

      case VOICE_CHANNELS.screen: {
        const payload = message.payload as VoiceScreenMessage | undefined
        if (payload?.screen && session) session.setScreen(payload.screen, payload.context)
        return
      }

      case VOICE_CHANNELS.toolResult: {
        const payload = message.payload as VoiceToolResultMessage | undefined
        if (!payload) return
        const entry = pending.get(payload.requestId)
        if (!entry) return
        clearTimeout(entry.timer)
        pending.delete(payload.requestId)
        entry.resolve(payload.outcome)
        return
      }

      case VOICE_CHANNELS.stop: {
        await shutdown()
        socket.close(1000, 'closed')
        return
      }
    }
  }

  async function open(start: VoiceStartRequest | undefined): Promise<void> {
    if (!start?.surfaces) {
      socket.close(4000, 'bad start')
      return
    }

    try {
      session = await startVoiceSession(
        {
          onAudio: chunk => send(VOICE_CHANNELS.audioOut, Buffer.from(chunk).toString('base64')),
          runCommand,
          onTranscript: (text, role) => send(VOICE_CHANNELS.transcript, { text, role }),
          onInterrupted: () => send(VOICE_CHANNELS.interrupted),
          onTurnComplete: () => send(VOICE_CHANNELS.turnComplete),
          onClosed: reason => {
            send(VOICE_CHANNELS.closed, reason)
            void shutdown()
          },
          log: (event, fields) =>
            // The org, never the ticket. Logs are read by people who should not
            // be able to reconnect as somebody else from them.
            console.log(`[relay] ${event} ${JSON.stringify({ org: ticket.orgId, ...fields })}`),
        },
        {
          screen: start.screen,
          config: loadVoiceConfig(),
          resolveScope: scopeResolver(start.surfaces),
          ...(ticket.projectId ? { projectId: ticket.projectId } : {}),
          ...(ticket.projectName ? { projectName: ticket.projectName } : {}),
          // Page content, not identity: trusted from the authenticated ticket
          // above is right for who the user is, but the page itself is only
          // ever the browser's to say, and it is already framed as untrusted
          // content in the prompt.
          ...(start.pageSummary ? { pageSummary: start.pageSummary } : {}),
          ...(start.journal ? { journal: start.journal } : {}),
        },
      )
      send(VOICE_CHANNELS.start, { ok: true })
    } catch (error) {
      // Vertex errors carry project ids and quota detail. The browser gets a
      // sentence; the detail stays in the relay's log.
      console.log(`[relay] start failed: ${String(error).slice(0, 400)}`)
      send(VOICE_CHANNELS.start, { ok: false, error: 'Voice could not start. Please try again.' })
      socket.close(4005, 'start failed')
    }
  }
}

/**
 * Rebuild `ScreenScope` from what the browser sent.
 *
 * `allows` is derived here rather than trusted from the wire: it is what every
 * tool call is re-checked against, so it has to agree exactly with the surface
 * the model was handed and not with what a caller claims about it.
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
