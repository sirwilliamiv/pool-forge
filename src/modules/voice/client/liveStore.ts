'use client'

import { create } from 'zustand'

import type { VoiceStatus } from './useVoiceSession'

/**
 * The voice session's status, readable from anywhere.
 *
 * `useVoiceSession` owns the session and lives inside the dock; the editor's
 * live border has to know whether Marco is listening without the dock passing
 * props across the app shell. The hook mirrors its status here and everything
 * else subscribes.
 */
interface VoiceLiveState {
  status: VoiceStatus
  setStatus: (status: VoiceStatus) => void
}

export const useVoiceLiveStore = create<VoiceLiveState>(set => ({
  status: 'unavailable',
  setStatus: status => set({ status }),
}))
