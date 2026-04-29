'use client'

import { create } from 'zustand'
import type { Shape } from './shapes'

const CAPACITY = 100

export interface HistorySnapshot {
  shapes: Shape[]
}

interface HistoryState {
  past: HistorySnapshot[]
  future: HistorySnapshot[]

  // Bound by shapesStore on module load (avoids circular import).
  _getShapes: (() => Shape[]) | null
  _setShapes: ((shapes: Shape[]) => void) | null
  bindShapesAccessor: (
    getter: () => Shape[],
    setter: (shapes: Shape[]) => void,
  ) => void

  // Stack ops the dispatcher uses.
  pushPast: (snapshot: HistorySnapshot) => void  // also clears future
  pushFuture: (snapshot: HistorySnapshot) => void
  popPast: () => HistorySnapshot | null
  popFuture: () => HistorySnapshot | null

  // Public surface preserved for the toolbar.
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  reset: () => void
}

function trim(stack: HistorySnapshot[]): HistorySnapshot[] {
  return stack.length > CAPACITY ? stack.slice(stack.length - CAPACITY) : stack
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],
  _getShapes: null,
  _setShapes: null,

  bindShapesAccessor: (getter, setter) => {
    if (get()._getShapes) return  // bind once
    set({ _getShapes: getter, _setShapes: setter })
  },

  pushPast: (snapshot) =>
    set((s) => ({ past: trim([...s.past, snapshot]), future: [] })),

  pushFuture: (snapshot) =>
    set((s) => ({ future: trim([...s.future, snapshot]) })),

  popPast: () => {
    const { past } = get()
    const top = past[past.length - 1]
    if (!top) return null
    set((s) => ({ past: s.past.slice(0, -1) }))
    return top
  },

  popFuture: () => {
    const { future } = get()
    const top = future[future.length - 1]
    if (!top) return null
    set((s) => ({ future: s.future.slice(0, -1) }))
    return top
  },

  undo: () => {
    const { _getShapes, _setShapes } = get()
    if (!_getShapes || !_setShapes) return
    const previous = get().popPast()
    if (!previous) return
    get().pushFuture({ shapes: _getShapes() })
    _setShapes(previous.shapes)
  },

  redo: () => {
    const { _getShapes, _setShapes } = get()
    if (!_getShapes || !_setShapes) return
    const next = get().popFuture()
    if (!next) return
    set((s) => ({ past: trim([...s.past, { shapes: _getShapes() }]) }))
    _setShapes(next.shapes)
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  reset: () => set({ past: [], future: [] }),
}))
