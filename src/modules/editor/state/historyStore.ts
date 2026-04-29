'use client'

import { create } from 'zustand'

export type HistorySnapshot = {
  id: string
  label: string
  takenAt: number
  payload: unknown
}

interface HistoryState {
  undoStack: HistorySnapshot[]
  redoStack: HistorySnapshot[]
  capacity: number

  push: (snapshot: HistorySnapshot) => void
  undo: () => HistorySnapshot | undefined
  redo: () => HistorySnapshot | undefined
  clear: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  undoStack: [],
  redoStack: [],
  capacity: 100,

  push: (snapshot) =>
    set((s) => {
      const next = [...s.undoStack, snapshot]
      const trimmed = next.length > s.capacity ? next.slice(next.length - s.capacity) : next
      return { undoStack: trimmed, redoStack: [] }
    }),
  undo: () => {
    const { undoStack } = get()
    const top = undoStack[undoStack.length - 1]
    if (!top) return undefined
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, top],
    }))
    return top
  },
  redo: () => {
    const { redoStack } = get()
    const top = redoStack[redoStack.length - 1]
    if (!top) return undefined
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, top],
    }))
    return top
  },
  clear: () => set({ undoStack: [], redoStack: [] }),
  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}))
