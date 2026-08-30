import type { CommandOutcome } from './session'
import type { ToolSurface } from './tools'
import type { CommandCategory } from '@/modules/commands/registry'
import type { VoiceScreen } from './scope'

export type { VoiceScreen }

// The contract between the process that owns the microphone and the one that
// owns the app.
//
// One module, imported by both sides. Every integration defect in this codebase
// so far has been two modules independently declaring the same shape and drifting
// by a field name, so the channel names and the payloads live together here and
// neither side gets to spell them itself.

export const VOICE_CHANNELS = {
  /** renderer → main */
  start: 'voice:start',
  audio: 'voice:audio',
  screen: 'voice:screen',
  stop: 'voice:stop',
  toolResult: 'voice:tool-result',
  /** main → renderer */
  audioOut: 'voice:audio-out',
  toolCall: 'voice:tool-call',
  transcript: 'voice:transcript',
  interrupted: 'voice:interrupted',
  turnComplete: 'voice:turn-complete',
  closed: 'voice:closed',
} as const

export interface VoiceStartRequest {
  screen: VoiceScreen
  projectId?: string
  projectName?: string
  /**
   * A snapshot of what is rendered on screen, so the session opens already
   * aware of the page instead of asking. Untrusted page content: framed as
   * such in the prompt, capped again on the way in rather than trusted from
   * the wire.
   */
  pageSummary?: string
  /**
   * Every screen's tool surface, computed by the renderer.
   *
   * The main process does not register commands: doing so would pull Prisma and
   * next-auth into the process holding the socket, to obtain nothing but a list
   * of names and JSON schemas the renderer already has.
   */
  surfaces: Record<VoiceScreen, SerializedScope>
}

/** A `ScreenScope` with the function stripped, so it survives IPC. */
export interface SerializedScope {
  categories: CommandCategory[]
  surface: ToolSurface
}

export interface VoiceStartResult {
  ok: boolean
  /** Safe to show. Never provider text. */
  error?: string
  /** Correlates a user-visible failure with the server log. */
  ref?: string
}

export interface VoiceToolCallEvent {
  requestId: string
  commandId: string
  args: unknown
}

export interface VoiceToolResultMessage {
  requestId: string
  outcome: CommandOutcome
}

/** What `setScreen` puts on the wire. */
export interface VoiceScreenMessage {
  screen: VoiceScreen
  context?: VoiceContextMessage
}

/** What the user has open, told to the model rather than only used by the client. */
export interface VoiceContextMessage {
  projectId?: string
  projectName?: string
  /** A fresh snapshot of the new page, computed after the screen has changed. */
  pageSummary?: string
}

export interface VoiceTranscriptEvent {
  text: string
  role: 'user' | 'model'
}

/** The surface `preload.cjs` exposes on `window`. */
export interface VoiceBridge {
  available: true
  start(request: VoiceStartRequest): Promise<VoiceStartResult>
  sendAudio(frame: ArrayBuffer): void
  setScreen(screen: VoiceScreen, context?: VoiceContextMessage): void
  stop(): Promise<void>
  /** Register the handler that runs commands. Returns an unsubscribe. */
  onToolCall(handler: (event: VoiceToolCallEvent) => void): () => void
  onAudio(handler: (frame: ArrayBuffer) => void): () => void
  onTranscript(handler: (event: VoiceTranscriptEvent) => void): () => void
  onInterrupted(handler: () => void): () => void
  onTurnComplete(handler: () => void): () => void
  onClosed(handler: (reason: string) => void): () => void
  respond(message: VoiceToolResultMessage): void
}

/**
 * The bridge, or null in a plain browser.
 *
 * Voice needs a Node process holding ADC, so it exists in the desktop build and
 * not on the web until the relay service ships. Callers branch on null rather
 * than feature-detecting individual methods.
 */
export function getVoiceBridge(): VoiceBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as { poolForgeVoice?: VoiceBridge }).poolForgeVoice
  return bridge?.available ? bridge : null
}
