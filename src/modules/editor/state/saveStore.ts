'use client'

import { create } from 'zustand'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SaveStatusState {
  status: SaveStatus
  lastSavedAt: number | null
  setStatus: (status: SaveStatus) => void
  markSaved: () => void
}

export const useSaveStatusStore = create<SaveStatusState>((set) => ({
  status: 'idle',
  lastSavedAt: null,
  setStatus(status) {
    set({ status })
  },
  markSaved() {
    set({ status: 'saved', lastSavedAt: Date.now() })
  },
}))
