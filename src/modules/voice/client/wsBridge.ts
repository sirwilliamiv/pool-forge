'use client'

import {
  VOICE_CHANNELS,
  type VoiceBridge,
  type VoiceContextMessage,
  type VoiceScreen,
  type VoiceStartRequest,
  type VoiceStartResult,
  type VoiceToolCallEvent,
  type VoiceToolResultMessage,
  type VoiceTranscriptEvent,
} from '../bridge'

// The web transport.
//
// The same `VoiceBridge` the desktop build satisfies over Electron IPC, so
// `useVoiceSession` never learns which one it is talking to. That was the reason
// for the interface: a second transport should be a socket and a message shape,
// not a second copy of the client.

type Handler<T> = (payload: T) => void

interface Subscribers {
  audio: Set<Handler<ArrayBuffer>>
  toolCall: Set<Handler<VoiceToolCallEvent>>
  transcript: Set<Handler<VoiceTranscriptEvent>>
  interrupted: Set<Handler<void>>
  turnComplete: Set<Handler<void>>
  closed: Set<Handler<string>>
}

/** Where the relay lives. Absent means this build has no web voice. */
export function relayUrl(): string | null {
  const configured = process.env['NEXT_PUBLIC_VOICE_RELAY_URL']?.trim()
  return configured ? configured : null
}

/**
 * Connect to the relay.
 *
 * The ticket is fetched here rather than passed in, because it is only valid for
 * sixty seconds and the caller has no reason to know that.
 */
export async function createWebSocketBridge(getTicket: () => Promise<string>): Promise<VoiceBridge | null> {
  const base = relayUrl()
  if (!base || typeof WebSocket === 'undefined') return null

  const subscribers: Subscribers = {
    audio: new Set(),
    toolCall: new Set(),
    transcript: new Set(),
    interrupted: new Set(),
    turnComplete: new Set(),
    closed: new Set(),
  }

  let socket: WebSocket | null = null
  let startResolve: ((result: VoiceStartResult) => void) | null = null

  const send = (channel: string, payload?: unknown): void => {
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ channel, payload }))
  }

  return {
    available: true,

    async start(request: VoiceStartRequest): Promise<VoiceStartResult> {
      let ticket: string
      try {
        ticket = await getTicket()
      } catch {
        return { ok: false, error: 'Voice could not start.' }
      }

      return new Promise<VoiceStartResult>(resolve => {
        startResolve = resolve

        // The ticket rides in the query string because a browser WebSocket
        // cannot set headers. It is why the ticket lives sixty seconds and is
        // single use: a URL is the least private place a credential can sit.
        const next = new WebSocket(`${base}?ticket=${encodeURIComponent(ticket)}`)
        socket = next

        next.onopen = () => send(VOICE_CHANNELS.start, request)

        next.onmessage = event => {
          let message: { channel?: string; payload?: unknown }
          try {
            message = JSON.parse(String(event.data)) as { channel?: string; payload?: unknown }
          } catch {
            return
          }

          switch (message.channel) {
            case VOICE_CHANNELS.start: {
              const result = message.payload as { ok?: boolean; error?: string }
              startResolve?.(
                result?.ok
                  ? { ok: true }
                  : { ok: false, error: result?.error ?? 'Voice could not start.' },
              )
              startResolve = null
              return
            }
            case VOICE_CHANNELS.audioOut: {
              const encoded = message.payload
              if (typeof encoded !== 'string') return
              for (const handler of subscribers.audio) handler(decode(encoded))
              return
            }
            case VOICE_CHANNELS.toolCall:
              for (const handler of subscribers.toolCall) handler(message.payload as VoiceToolCallEvent)
              return
            case VOICE_CHANNELS.transcript:
              for (const handler of subscribers.transcript) {
                handler(message.payload as VoiceTranscriptEvent)
              }
              return
            case VOICE_CHANNELS.interrupted:
              for (const handler of subscribers.interrupted) handler()
              return
            case VOICE_CHANNELS.turnComplete:
              for (const handler of subscribers.turnComplete) handler()
              return
            case VOICE_CHANNELS.closed:
              for (const handler of subscribers.closed) handler(String(message.payload ?? 'closed'))
              return
          }
        }

        next.onclose = event => {
          // A close before the start reply is the only signal the caller gets
          // that the connection was refused, so it has to resolve the promise.
          startResolve?.({
            ok: false,
            error:
              event.code === 4001
                ? 'Voice could not be authorised. Please try again.'
                : 'Voice could not start.',
          })
          startResolve = null
          socket = null
          for (const handler of subscribers.closed) handler('The voice session ended.')
        }

        next.onerror = () => {
          startResolve?.({ ok: false, error: 'Voice could not reach the server.' })
          startResolve = null
        }
      })
    },

    sendAudio(frame: ArrayBuffer): void {
      send(VOICE_CHANNELS.audio, encode(frame))
    },

    setScreen(screen: VoiceScreen, context?: VoiceContextMessage): void {
      send(VOICE_CHANNELS.screen, context === undefined ? { screen } : { screen, context })
    },

    async stop(): Promise<void> {
      send(VOICE_CHANNELS.stop)
      socket?.close()
      socket = null
    },

    respond(message: VoiceToolResultMessage): void {
      send(VOICE_CHANNELS.toolResult, message)
    },

    onToolCall: handler => subscribe(subscribers.toolCall, handler),
    onAudio: handler => subscribe(subscribers.audio, handler),
    onTranscript: handler => subscribe(subscribers.transcript, handler),
    onInterrupted: handler => subscribe(subscribers.interrupted, handler),
    onTurnComplete: handler => subscribe(subscribers.turnComplete, handler),
    onClosed: handler => subscribe(subscribers.closed, handler),
  }
}

function subscribe<T>(set: Set<Handler<T>>, handler: Handler<T>): () => void {
  set.add(handler)
  return () => set.delete(handler)
}

/** PCM16 as base64, matching what the relay reads. */
function encode(frame: ArrayBuffer): string {
  const bytes = new Uint8Array(frame)
  let binary = ''
  // Chunked: spreading a whole frame into String.fromCharCode blows the argument
  // limit on anything but the smallest buffers.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

function decode(encoded: string): ArrayBuffer {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
