import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import {
  VOICE_CHANNELS,
  type VoiceBridge,
  type VoiceStartRequest,
  type VoiceStartResult,
  type VoiceScreenMessage,
  type VoiceToolCallEvent,
  type VoiceToolResultMessage,
  type VoiceTranscriptEvent,
} from '../bridge'

// The only thing the renderer can reach in the main process.
//
// Compiled from TypeScript rather than hand-written as CommonJS so the channel
// names come from the same module the host reads them from. A preload that
// spelled its own strings would be one typo away from a feature that silently
// does nothing.

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const bridge: VoiceBridge = {
  available: true,
  start: (request: VoiceStartRequest): Promise<VoiceStartResult> =>
    ipcRenderer.invoke(VOICE_CHANNELS.start, request),
  sendAudio: frame => {
    ipcRenderer.send(VOICE_CHANNELS.audio, frame)
  },
  setScreen: (screen, context) => {
    const message: VoiceScreenMessage = context === undefined ? { screen } : { screen, context }
    ipcRenderer.send(VOICE_CHANNELS.screen, message)
  },
  stop: () => ipcRenderer.invoke(VOICE_CHANNELS.stop),
  respond: (message: VoiceToolResultMessage) => {
    ipcRenderer.send(VOICE_CHANNELS.toolResult, message)
  },
  onToolCall: handler => subscribe<VoiceToolCallEvent>(VOICE_CHANNELS.toolCall, handler),
  onAudio: handler => subscribe<ArrayBuffer>(VOICE_CHANNELS.audioOut, handler),
  onTranscript: handler => subscribe<VoiceTranscriptEvent>(VOICE_CHANNELS.transcript, handler),
  onInterrupted: handler => subscribe<undefined>(VOICE_CHANNELS.interrupted, () => handler()),
  onTurnComplete: handler => subscribe<undefined>(VOICE_CHANNELS.turnComplete, () => handler()),
  onClosed: handler => subscribe<string>(VOICE_CHANNELS.closed, handler),
}

contextBridge.exposeInMainWorld('poolForgeVoice', bridge)
