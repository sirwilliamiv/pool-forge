// The session is where a misheard sentence turns into a command, so these tests
// are mostly about what it refuses: out-of-scope calls, destructive calls that
// nobody confirmed, and provider detail leaking into something read aloud.
//
// A fake Live connection drives the whole conversation, so none of this needs
// credentials or a network.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initCommands } from '@/modules/commands/init'
import { DEFAULT_LIVE_MODEL } from '@/modules/voice/config'
import {
  startVoiceSession,
  type CommandOutcome,
  type LiveConnect,
  type LiveServerMessageLike,
  type LiveSession,
  type SessionHost,
} from '@/modules/voice/session'

initCommands()

const CONFIG = {
  project: 'test-project',
  location: 'us-central1',
  model: DEFAULT_LIVE_MODEL,
  enabled: true,
}

interface Harness {
  connect: LiveConnect
  /** Push a server message into the session. */
  emit: (message: LiveServerMessageLike) => void
  sentAudio: string[]
  sentText: string[]
  toolResponses: { name: string; response: Record<string, unknown> }[]
  closes: number
  connections: number
  lastConfig: Record<string, unknown> | null
}

function harness(): Harness {
  const state: Harness = {
    connect: null as never,
    emit: () => {},
    sentAudio: [],
    sentText: [],
    toolResponses: [],
    closes: 0,
    connections: 0,
    lastConfig: null,
  }

  state.connect = async params => {
    state.connections += 1
    state.lastConfig = params.config
    state.emit = params.callbacks.onmessage
    const session: LiveSession = {
      sendRealtimeInput: input => {
        if (input.audio) state.sentAudio.push(input.audio.data)
      },
      sendClientContent: content => {
        for (const turn of content.turns) {
          for (const part of turn.parts) state.sentText.push(part.text)
        }
      },
      sendToolResponse: response => {
        for (const fr of response.functionResponses) {
          state.toolResponses.push({ name: fr.name, response: fr.response })
        }
      },
      close: () => {
        state.closes += 1
      },
    }
    // Setup completes immediately, as it does in practice.
    queueMicrotask(() => params.callbacks.onopen())
    return session
  }

  return state
}

function hostWith(runCommand: SessionHost['runCommand']): {
  host: SessionHost
  audio: Uint8Array[]
  transcripts: string[]
  interruptions: number
} {
  const audio: Uint8Array[] = []
  const transcripts: string[] = []
  let interruptions = 0
  const host: SessionHost = {
    onAudio: chunk => audio.push(chunk),
    runCommand,
    onTranscript: text => transcripts.push(text),
    onInterrupted: () => {
      interruptions += 1
    },
    log: () => {},
  }
  return {
    host,
    audio,
    transcripts,
    get interruptions() {
      return interruptions
    },
  } as never
}

const ok: CommandOutcome = { ok: true, summary: 'done' }

describe('voice session', () => {
  let h: Harness

  beforeEach(() => {
    h = harness()
  })

  it('offers the screen tool surface to the model at connect', async () => {
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })

    const tools = (h.lastConfig?.['tools'] as { functionDeclarations: { name: string }[] }[])[0]
    expect(tools?.functionDeclarations.length).toBeGreaterThan(15)
    expect(session.scope.screen).toBe('editor')
    await session.close()
  })

  it('runs an in-scope command and reports the result back to the model', async () => {
    const run = vi.fn(async () => ok)
    const { host } = hostWith(run)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })

    h.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'add.shape', args: { stencilId: 'pool.rectangle' } }] } })
    await vi.waitFor(() => expect(h.toolResponses).toHaveLength(1))

    expect(run).toHaveBeenCalledWith('add.shape', { stencilId: 'pool.rectangle' })
    expect(h.toolResponses[0]?.response['ok']).toBe(true)
    await session.close()
  })

  it('refuses a tool from another screen instead of running it', async () => {
    // The model was handed a scoped surface, but that is not a guarantee about
    // what it sends: it can hallucinate, or reach for a tool from a screen the
    // user has since left.
    const run = vi.fn(async () => ok)
    const { host } = hostWith(run)
    const session = await startVoiceSession(host, { screen: 'dashboard', config: CONFIG, connect: h.connect })

    h.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'add.shape', args: {} }] } })
    await vi.waitFor(() => expect(h.toolResponses).toHaveLength(1))

    expect(run, 'an out-of-scope command must never reach the client').not.toHaveBeenCalled()
    expect(h.toolResponses[0]?.response['ok']).toBe(false)
    expect(String(h.toolResponses[0]?.response['summary'])).toMatch(/not available on this screen/i)
    await session.close()
  })

  it('refuses a hallucinated tool name', async () => {
    const run = vi.fn(async () => ok)
    const { host } = hostWith(run)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })

    h.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'pool.make.awesome', args: {} }] } })
    await vi.waitFor(() => expect(h.toolResponses).toHaveLength(1))
    expect(run).not.toHaveBeenCalled()
    await session.close()
  })

  it('will not run a destructive command on first hearing', async () => {
    // This is the one that matters. Voice misrecognition plus an apply is how a
    // drawing disappears.
    const run = vi.fn(async () => ok)
    const { host } = hostWith(run)
    const session = await startVoiceSession(host, { screen: 'import', config: CONFIG, connect: h.connect })

    h.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'import.intent.apply', args: { sessionId: 's', projectId: 'p' } }] } })
    await vi.waitFor(() => expect(h.toolResponses).toHaveLength(1))

    expect(run, 'destructive work must not run unconfirmed').not.toHaveBeenCalled()
    expect(String(h.toolResponses[0]?.response['summary'])).toMatch(/cannot be recovered/i)
    await session.close()
  })

  it('runs the destructive command once it has been announced and confirmed', async () => {
    const run = vi.fn(async () => ok)
    const { host } = hostWith(run)
    const session = await startVoiceSession(host, { screen: 'import', config: CONFIG, connect: h.connect })

    const args = { sessionId: 's', projectId: 'p' }
    h.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'import.intent.apply', args }] } })
    await vi.waitFor(() => expect(h.toolResponses).toHaveLength(1))

    h.emit({ toolCall: { functionCalls: [{ id: 'c2', name: 'import.intent.apply', args: { ...args, confirm: true } }] } })
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    await session.close()
  })

  it('will not accept a confirmation for something it never refused', async () => {
    // Otherwise the confirmation is worthless: a model could send `confirm: true`
    // on the first call and the user would never hear what was about to go.
    const run = vi.fn(async () => ok)
    const { host } = hostWith(run)
    const session = await startVoiceSession(host, { screen: 'import', config: CONFIG, connect: h.connect })

    h.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'import.intent.apply', args: { sessionId: 's', projectId: 'p', confirm: true } }] } })
    await vi.waitFor(() => expect(h.toolResponses).toHaveLength(1))

    expect(run, 'a self-issued confirmation must not count').not.toHaveBeenCalled()
    await session.close()
  })

  it('never reads provider detail aloud when a command throws', async () => {
    const { host } = hostWith(async () => {
      throw new Error('PrismaClientKnownRequestError: connect ECONNREFUSED 10.1.2.3:5432')
    })
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })

    h.emit({ toolCall: { functionCalls: [{ id: 'c1', name: 'add.shape', args: {} }] } })
    await vi.waitFor(() => expect(h.toolResponses).toHaveLength(1))

    const summary = String(h.toolResponses[0]?.response['summary'])
    expect(summary).not.toMatch(/Prisma|ECONNREFUSED|10\.1\.2\.3/)
    await session.close()
  })

  it('tells the model which project is open instead of making it ask', async () => {
    // Without this the agent refuses project-scoped requests before trying them
    // — "I can't go to the proposal page until I know which project you mean" —
    // while the browser held the id the whole time.
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, {
      screen: 'editor',
      config: CONFIG,
      connect: h.connect,
      projectId: 'proj_123',
      projectName: 'Phone Demo',
    })

    const instruction = JSON.stringify(h.lastConfig?.['systemInstruction'])
    expect(instruction).toContain('proj_123')
    expect(instruction).toContain('Phone Demo')
    await session.close()
  })

  it('says plainly when no project is open', async () => {
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'dashboard', config: CONFIG, connect: h.connect })
    expect(JSON.stringify(h.lastConfig?.['systemInstruction'])).toMatch(/No project is open/i)
    await session.close()
  })

  it('reconnects when the project changes, not only the screen', async () => {
    // Opening a different job mid-conversation has to change what the agent
    // thinks it is looking at, or it answers about the previous one.
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, {
      screen: 'editor',
      config: CONFIG,
      connect: h.connect,
      projectId: 'proj_a',
    })
    expect(h.connections).toBe(1)

    session.setScreen('editor', { projectId: 'proj_b' })
    await vi.waitFor(() => expect(h.connections).toBe(2))
    expect(JSON.stringify(h.lastConfig?.['systemInstruction'])).toContain('proj_b')
    await session.close()
  })

  it('names the transcription language rather than letting it be detected', async () => {
    // An empty transcription config means automatic detection, which returned an
    // English sentence transliterated into Devanagari.
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })
    const input = h.lastConfig?.['inputAudioTranscription'] as { languageCodes?: string[] }
    expect(input?.languageCodes).toEqual(['en-US'])
    await session.close()
  })

  it('pins the language rather than letting the model detect one', async () => {
    // A native-audio model left to detect drifts mid-conversation and drops a
    // Japanese word into an English answer, which reads as a broken app.
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })
    expect((h.lastConfig?.['speechConfig'] as { languageCode?: string })?.languageCode).toBe('en-US')
    await session.close()
  })

  it('tells the host when a turn ends', async () => {
    // Transcription arrives in fragments with no separators, so without a turn
    // boundary two answers run together as one sentence on screen.
    let turns = 0
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(
      { ...host, onTurnComplete: () => { turns += 1 } },
      { screen: 'editor', config: CONFIG, connect: h.connect },
    )

    h.emit({ serverContent: { outputTranscription: { text: 'Done.' } } })
    expect(turns).toBe(0)
    h.emit({ serverContent: { turnComplete: true } })
    expect(turns).toBe(1)
    await session.close()
  })

  it('passes model audio to the host and flags barge-in', async () => {
    const bag = hostWith(async () => ok) as unknown as {
      host: SessionHost
      audio: Uint8Array[]
      interruptions: number
    }
    const session = await startVoiceSession(bag.host, { screen: 'editor', config: CONFIG, connect: h.connect })

    h.emit({
      serverContent: { modelTurn: { parts: [{ inlineData: { data: Buffer.from([1, 2, 3]).toString('base64') } }] } },
    })
    expect(bag.audio).toHaveLength(1)
    expect(Array.from(bag.audio[0]!)).toEqual([1, 2, 3])

    h.emit({ serverContent: { interrupted: true } })
    expect(bag.interruptions, 'playback must be dropped the moment the model is cut off').toBe(1)
    await session.close()
  })

  it('caps the audio buffered while reconnecting', async () => {
    // Audio is only useful fresh. An unbounded queue turns a brief reconnect
    // into a conversation permanently running seconds behind, which is worse
    // than losing the stalled moment.
    let attempts = 0
    // A noop rather than null: assigning inside the executor is invisible to
    // control-flow analysis, so a nullable here narrows to `never` at the call.
    let release: () => void = () => {}
    const stallSecond: LiveConnect = async params => {
      attempts += 1
      if (attempts === 2) {
        await new Promise<void>(resolve => {
          release = resolve
        })
      }
      return h.connect(params)
    }

    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: stallSecond })

    // Force a reconnect, then hold it open so `live` stays null.
    h.emit({ goAway: { timeLeft: '1s' } })
    await vi.waitFor(() => expect(attempts).toBe(2))

    const sentBefore = h.sentAudio.length
    for (let i = 0; i < 500; i++) session.sendAudio(new Uint8Array([i % 256]))

    // Nothing reached the wire while disconnected, and the queue is bounded by
    // MAX_BUFFERED_FRAMES rather than holding all five hundred.
    expect(h.sentAudio.length).toBe(sentBefore)
    release()
    await vi.waitFor(() => expect(h.sentAudio.length).toBeLessThan(sentBefore + 200))
    await session.close()
  })

  it('reconnects on a GoAway rather than dropping the call', async () => {
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })
    expect(h.connections).toBe(1)

    h.emit({ sessionResumptionUpdate: { newHandle: 'handle-abc', resumable: true } })
    h.emit({ goAway: { timeLeft: '10s' } })

    await vi.waitFor(() => expect(h.connections).toBe(2))
    // The handle carries the conversation across, so the user never sees a seam.
    expect((h.lastConfig?.['sessionResumption'] as { handle?: string })?.handle).toBe('handle-abc')
    await session.close()
  })

  it('swaps the toolset when the user changes screen', async () => {
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'dashboard', config: CONFIG, connect: h.connect })
    expect(session.scope.allows('add.shape')).toBe(false)

    session.setScreen('editor')
    await vi.waitFor(() => expect(h.connections).toBe(2))
    expect(session.scope.allows('add.shape')).toBe(true)
    await session.close()
  })

  it('stops sending once closed', async () => {
    const { host } = hostWith(async () => ok)
    const session = await startVoiceSession(host, { screen: 'editor', config: CONFIG, connect: h.connect })
    await session.close()
    const before = h.sentAudio.length
    session.sendAudio(new Uint8Array([9, 9]))
    expect(h.sentAudio.length).toBe(before)
  })
})
