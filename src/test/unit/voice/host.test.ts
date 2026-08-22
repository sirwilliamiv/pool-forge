// The desktop host is the seam between the process that may hold credentials and
// the process that owns the app. These tests drive it through a fake ipcMain, so
// they cover the wiring itself: what reaches the window, what comes back, and
// what a failure is allowed to say.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initCommands } from '@/modules/commands/init'
import { VOICE_CHANNELS, type SerializedScope } from '@/modules/voice/bridge'
import { installVoiceHost, type IpcMainLike } from '@/modules/voice/electron/host'
import { scopeFor, VOICE_SCREENS, type VoiceScreen } from '@/modules/voice/scope'
import type {
  CommandOutcome,
  SessionHost,
  SessionOptions,
  VoiceSession,
} from '@/modules/voice/session'

initCommands()

const ENV = {
  VOICE_LIVE: '1',
  GCP_PROJECT_ID: 'test-project',
  VERTEX_LOCATION: 'us-central1',
}

function surfaces(): Record<VoiceScreen, SerializedScope> {
  const built = {} as Record<VoiceScreen, SerializedScope>
  for (const screen of VOICE_SCREENS) {
    const scope = scopeFor(screen)
    built[screen] = { categories: scope.categories, surface: scope.surface }
  }
  return built
}

interface Ipc extends IpcMainLike {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>
  emit: (channel: string, payload?: unknown) => void
}

function fakeIpc(): Ipc {
  const handlers = new Map<string, (event: unknown, ...args: never[]) => unknown>()
  const listeners = new Map<string, ((event: unknown, ...args: never[]) => void)[]>()
  return {
    handle: (channel, listener) => {
      handlers.set(channel, listener)
    },
    on: (channel, listener) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener])
    },
    invoke: async (channel, payload) => handlers.get(channel)?.({}, payload as never),
    emit: (channel, payload) => {
      for (const listener of listeners.get(channel) ?? []) listener({}, payload as never)
    },
  }
}

interface Window {
  send: (channel: string, ...args: unknown[]) => void
  sent: { channel: string; args: unknown[] }[]
}

function fakeWindow(): Window {
  const sent: { channel: string; args: unknown[] }[] = []
  return { send: (channel, ...args) => void sent.push({ channel, args }), sent }
}

describe('electron voice host', () => {
  let ipc: Ipc
  let window: Window
  /** Captured so a test can act as the session and as the model. */
  let captured: { host: SessionHost; options: SessionOptions } | null

  const fakeSession: VoiceSession = {
    sendAudio: vi.fn(),
    sendText: vi.fn(),
    endAudio: vi.fn(),
    setScreen: vi.fn(),
    close: vi.fn(async () => {}),
    scope: scopeFor('editor'),
    categories: [],
  }

  const startSession = vi.fn(async (host: SessionHost, options: SessionOptions) => {
    captured = { host, options }
    return fakeSession
  })

  function install(overrides: Partial<Parameters<typeof installVoiceHost>[0]> = {}) {
    return installVoiceHost({
      ipcMain: ipc,
      getWindow: () => window,
      env: ENV,
      startSession: startSession as never,
      log: () => {},
      ...overrides,
    })
  }

  async function startOk() {
    const result = await ipc.invoke(VOICE_CHANNELS.start, {
      screen: 'editor',
      surfaces: surfaces(),
    })
    expect(result).toEqual({ ok: true })
  }

  beforeEach(() => {
    ipc = fakeIpc()
    window = fakeWindow()
    captured = null
    vi.clearAllMocks()
  })

  it('refuses to start when voice is not configured, and says why', () => {
    // A dead button is the worst version of this: the user cannot tell a missing
    // env var from a broken microphone.
    install({ env: { GCP_PROJECT_ID: 'test-project' } })
    return ipc.invoke(VOICE_CHANNELS.start, { screen: 'editor', surfaces: surfaces() }).then(result => {
      expect(result).toMatchObject({ ok: false })
      expect(String((result as { error: string }).error)).toMatch(/turned off/i)
      expect(startSession).not.toHaveBeenCalled()
    })
  })

  it('asks the window to run a command and resolves on its reply', async () => {
    install()
    await startOk()

    const outcome: Promise<CommandOutcome> = captured!.host.runCommand('add.shape', { stencilId: 'x' })

    const call = window.sent.find(entry => entry.channel === VOICE_CHANNELS.toolCall)
    expect(call, 'the tool call must reach the renderer').toBeDefined()
    const { requestId, commandId } = call!.args[0] as { requestId: string; commandId: string }
    expect(commandId).toBe('add.shape')

    ipc.emit(VOICE_CHANNELS.toolResult, { requestId, outcome: { ok: true, summary: 'added' } })
    await expect(outcome).resolves.toEqual({ ok: true, summary: 'added' })
  })

  it('fails a command cleanly when there is no window to run it', async () => {
    install({ getWindow: () => null })
    // Started with a window absent throughout, which is what a closed window
    // mid-session looks like from here.
    await ipc.invoke(VOICE_CHANNELS.start, { screen: 'editor', surfaces: surfaces() })
    const result = await captured!.host.runCommand('add.shape', {})
    expect(result.ok).toBe(false)
  })

  it('derives what is allowed from the surface rather than trusting the wire', async () => {
    install()
    const sent = surfaces()
    // A caller claiming a category it was not given tools for must not widen
    // what the session will run.
    sent.dashboard = { categories: ['canvas', 'shape'], surface: { tools: [], refused: [] } }
    await ipc.invoke(VOICE_CHANNELS.start, { screen: 'dashboard', surfaces: sent })

    const resolve = captured!.options.resolveScope!
    expect(resolve('dashboard').allows('add.shape')).toBe(false)
    expect(resolve('editor').allows('add.shape')).toBe(true)
  })

  it('never returns provider detail when the session fails to open', async () => {
    startSession.mockRejectedValueOnce(
      new Error('PERMISSION_DENIED: projects/pool-forge-prod aiplatform quota token ya29.abc'),
    )
    install()
    const result = (await ipc.invoke(VOICE_CHANNELS.start, {
      screen: 'editor',
      surfaces: surfaces(),
    })) as { ok: boolean; error: string; ref: string }

    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/PERMISSION_DENIED|ya29|pool-forge-prod/)
    expect(result.ref, 'a ref is what makes the log entry findable').toMatch(/^err_[0-9a-f]{12}$/)
  })

  it('answers commands still in flight when the session stops', async () => {
    // Otherwise the renderer holds a promise nobody will ever resolve.
    install()
    await startOk()
    const pending = captured!.host.runCommand('add.shape', {})
    await ipc.invoke(VOICE_CHANNELS.stop)
    await expect(pending).resolves.toMatchObject({ ok: false })
    expect(fakeSession.close).toHaveBeenCalled()
  })

  it('forwards microphone frames to the session and model audio to the window', async () => {
    install()
    await startOk()

    ipc.emit(VOICE_CHANNELS.audio, new Uint8Array([1, 2, 3, 4]).buffer)
    expect(fakeSession.sendAudio).toHaveBeenCalledTimes(1)

    captured!.host.onAudio(new Uint8Array([9, 9]))
    const audio = window.sent.filter(entry => entry.channel === VOICE_CHANNELS.audioOut)
    expect(audio).toHaveLength(1)
    expect(new Uint8Array(audio[0]!.args[0] as ArrayBuffer)).toEqual(new Uint8Array([9, 9]))
  })

  it('ignores audio arriving before a session exists', () => {
    install()
    ipc.emit(VOICE_CHANNELS.audio, new Uint8Array([1]).buffer)
    expect(fakeSession.sendAudio).not.toHaveBeenCalled()
  })
})
