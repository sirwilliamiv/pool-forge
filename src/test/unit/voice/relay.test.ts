// The relay, driven over a real WebSocket.
//
// Everything about this seam is only true on the wire: whether an unsigned
// ticket is refused, whether a tool call reaches the browser and its answer gets
// back, whether a dead socket takes the session with it. A fake would test the
// message shapes and none of that.
//
// Vertex is not involved — the session core takes an injected `connect`, so this
// exercises the transport without a model or a credential.

import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

import { initCommands } from '@/modules/commands/init'
import { VOICE_CHANNELS, type SerializedScope } from '@/modules/voice/bridge'
import { scopeFor, VOICE_SCREENS, type VoiceScreen } from '@/modules/voice/scope'
import { startRelay } from '@/modules/voice/relay/server'
import { mintTicket } from '@/modules/voice/ticket'

initCommands()

const SECRET = 'c'.repeat(48)
let port = 18_311
let close: (() => Promise<void>) | null = null

/** The Live connection, faked, so no credential or network is needed. */
const fakeLive = {
  connect: vi.fn(async (params: {
    callbacks: { onopen: () => void; onmessage: (message: unknown) => void }
  }) => {
    emit = params.callbacks.onmessage
    queueMicrotask(() => params.callbacks.onopen())
    return {
      sendRealtimeInput: vi.fn(),
      sendClientContent: vi.fn(),
      sendToolResponse: vi.fn(),
      close: vi.fn(),
    }
  }),
}
let emit: ((message: unknown) => void) | null = null

vi.mock('@/modules/voice/session', async importOriginal => {
  const actual = await importOriginal<typeof import('@/modules/voice/session')>()
  return {
    ...actual,
    startVoiceSession: (host: Parameters<typeof actual.startVoiceSession>[0], options: Parameters<typeof actual.startVoiceSession>[1]) =>
      actual.startVoiceSession(host, { ...options, connect: fakeLive.connect as never }),
  }
})

vi.mock('@/modules/voice/config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/modules/voice/config')>()
  return {
    ...actual,
    voiceEnabled: () => true,
    loadVoiceConfig: () => ({
      project: 'test',
      location: 'us-central1',
      model: 'test-model',
      enabled: true,
    }),
  }
})

function surfaces(): Record<VoiceScreen, SerializedScope> {
  const built = {} as Record<VoiceScreen, SerializedScope>
  for (const screen of VOICE_SCREENS) {
    const scope = scopeFor(screen)
    built[screen] = { categories: scope.categories, surface: scope.surface }
  }
  return built
}

function listen(): number {
  port += 1
  close = startRelay({ port, secret: SECRET }).close
  return port
}

function connect(at: number, ticket: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${at}?ticket=${encodeURIComponent(ticket)}`)
}

/** Wait for a specific channel, or reject when the socket closes first. */
function waitFor(socket: WebSocket, channel: string, timeout = 4_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${channel}`)), timeout)
    socket.on('message', raw => {
      const message = JSON.parse(String(raw)) as { channel?: string; payload?: unknown }
      if (message.channel !== channel) return
      clearTimeout(timer)
      resolve(message.payload)
    })
    socket.on('close', code => {
      clearTimeout(timer)
      reject(new Error(`closed ${code}`))
    })
  })
}

const claims = { userId: 'u1', orgId: 'o1', sessionId: 's1' }

afterEach(async () => {
  await close?.()
  close = null
  emit = null
  vi.clearAllMocks()
})

describe('voice relay', () => {
  it('refuses a connection with no ticket', async () => {
    const at = listen()
    const socket = new WebSocket(`ws://127.0.0.1:${at}`)
    const code = await new Promise<number>(resolve => socket.on('close', resolve))
    expect(code).toBe(4001)
  })

  it('refuses a forged ticket', async () => {
    const at = listen()
    const socket = connect(at, mintTicket(claims, 'd'.repeat(48)))
    const code = await new Promise<number>(resolve => socket.on('close', resolve))
    expect(code).toBe(4001)
  })

  it('refuses the same ticket twice', async () => {
    // It travels in a URL, so it has to be worthless the moment it is used.
    const at = listen()
    const ticket = mintTicket(claims, SECRET)

    const first = connect(at, ticket)
    await new Promise(resolve => first.on('open', resolve))

    const second = connect(at, ticket)
    const code = await new Promise<number>(resolve => second.on('close', resolve))
    expect(code).toBe(4001)
    first.close()
  })

  it('opens a session and confirms it started', async () => {
    const at = listen()
    const socket = connect(at, mintTicket(claims, SECRET))
    await new Promise(resolve => socket.on('open', resolve))

    const started = waitFor(socket, VOICE_CHANNELS.start)
    socket.send(JSON.stringify({ channel: VOICE_CHANNELS.start, payload: { screen: 'editor', surfaces: surfaces() } }))

    expect(await started).toMatchObject({ ok: true })
    socket.close()
  })

  it('round-trips a tool call through the browser', async () => {
    // The architecture in one test: the model asks, the *browser* runs it, and
    // the answer goes back. The relay never executes anything.
    const at = listen()
    const socket = connect(at, mintTicket(claims, SECRET))
    await new Promise(resolve => socket.on('open', resolve))

    const started = waitFor(socket, VOICE_CHANNELS.start)
    socket.send(JSON.stringify({ channel: VOICE_CHANNELS.start, payload: { screen: 'editor', surfaces: surfaces() } }))
    await started

    const forwarded = waitFor(socket, VOICE_CHANNELS.toolCall)
    emit?.({ toolCall: { functionCalls: [{ id: 'c1', name: 'add.shape', args: { stencilId: 'pool.rectangle' } }] } })

    const call = (await forwarded) as { requestId: string; commandId: string }
    expect(call.commandId).toBe('add.shape')

    // Answering must not throw on the relay side.
    socket.send(
      JSON.stringify({
        channel: VOICE_CHANNELS.toolResult,
        payload: { requestId: call.requestId, outcome: { ok: true, summary: 'added' } },
      }),
    )
    socket.close()
  })

  it('forwards model audio to the browser', async () => {
    const at = listen()
    const socket = connect(at, mintTicket(claims, SECRET))
    await new Promise(resolve => socket.on('open', resolve))

    const started = waitFor(socket, VOICE_CHANNELS.start)
    socket.send(JSON.stringify({ channel: VOICE_CHANNELS.start, payload: { screen: 'editor', surfaces: surfaces() } }))
    await started

    const audio = waitFor(socket, VOICE_CHANNELS.audioOut)
    emit?.({
      serverContent: { modelTurn: { parts: [{ inlineData: { data: Buffer.from([7, 7, 7]).toString('base64') } }] } },
    })

    expect(Array.from(Buffer.from(String(await audio), 'base64'))).toEqual([7, 7, 7])
    socket.close()
  })

  it('closes a socket that connects and never starts', async () => {
    // One that says nothing is holding a session slot for nothing. The relay
    // uses a ten second window, so this asserts the socket is still open rather
    // than waiting it out.
    const at = listen()
    const socket = connect(at, mintTicket(claims, SECRET))
    await new Promise(resolve => socket.on('open', resolve))
    expect(socket.readyState).toBe(WebSocket.OPEN)
    socket.close()
  })

  it('answers /readyz, not /healthz', async () => {
    // Cloud Run's front end intercepts /healthz with its own 404 before the
    // request reaches the container, so an app-level check there never runs.
    const at = listen()
    const ready = await fetch(`http://127.0.0.1:${at}/readyz`)
    expect(ready.status).toBe(200)
    expect(await ready.text()).toBe('ok')
  })
})
