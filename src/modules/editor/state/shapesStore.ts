'use client'

import { create } from 'zustand'
import { SHAPE_DEFAULTS, type Shape, type ShapeKind } from './shapes'
import { useHistoryStore } from './historyStore'

const TRANSACTION_AUTOCOMMIT_MS = 800

interface ShapesState {
  shapes: Shape[]
  hydrate: (shapes: Shape[]) => void
  addShape: (kind: ShapeKind, x: number, y: number) => string
  updateShape: (id: string, patch: Partial<Shape>) => void
  removeShape: (id: string) => void
  removeShapes: (ids: string[]) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  duplicate: (id: string) => string | null
  clear: () => void

  // Drag coalescing — wrap rapid updateShape() calls in a transaction
  // so they collapse into a single history entry.
  beginTransaction: () => void
  commitTransaction: () => void

  // Internal: replace shapes without pushing history (used by undo/redo).
  _replaceShapes: (shapes: Shape[]) => void
}

let nextZ = 1
let txOpen = false
let txTimer: ReturnType<typeof setTimeout> | null = null

function rid(prefix = 'shape') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultsFor(kind: ShapeKind, x: number, y: number, z: number): Shape {
  const d = SHAPE_DEFAULTS[kind]
  const base = {
    id: rid(kind),
    x,
    y,
    width: d.width,
    height: d.height,
    rotation: 0,
    zIndex: z,
    locked: false,
    hidden: false,
  }
  if (kind === 'rectangle-pool') {
    return { ...base, kind: 'rectangle-pool', depthShallow: 3, depthDeep: 5 }
  }
  if (kind === 'concrete-deck' || kind === 'paver-deck' || kind === 'grass-area') {
    return { ...base, kind }
  }
  return { ...base, kind }
}

export const useShapesStore = create<ShapesState>((set, get) => {
  // Snapshot the current shapes into history before a mutation.
  // No-op while a transaction is open beyond the initial push.
  function pushHistory() {
    useHistoryStore.getState().pushPast({ shapes: get().shapes })
  }

  function endTransaction() {
    txOpen = false
    if (txTimer) {
      clearTimeout(txTimer)
      txTimer = null
    }
  }

  // Discrete (non-coalesced) mutations always commit any open
  // transaction first so a drag-then-delete records two entries.
  function commitOpenTx() {
    if (txOpen) endTransaction()
  }

  return {
    shapes: [],

    hydrate(shapes) {
      nextZ = shapes.reduce((m, s) => Math.max(m, s.zIndex), 0) + 1
      endTransaction()
      useHistoryStore.getState().reset()
      set({ shapes })
    },

    _replaceShapes(shapes) {
      nextZ = shapes.reduce((m, s) => Math.max(m, s.zIndex), 0) + 1
      endTransaction()
      set({ shapes })
    },

    addShape(kind, x, y) {
      commitOpenTx()
      pushHistory()
      const z = nextZ++
      const shape = defaultsFor(kind, x, y, z)
      set({ shapes: [...get().shapes, shape] })
      return shape.id
    },

    updateShape(id, patch) {
      // Coalesce rapid updates (drag/resize) into one history entry.
      if (!txOpen) {
        pushHistory()
        txOpen = true
      }
      if (txTimer) clearTimeout(txTimer)
      txTimer = setTimeout(endTransaction, TRANSACTION_AUTOCOMMIT_MS)

      set({
        shapes: get().shapes.map((s) =>
          s.id === id ? ({ ...s, ...patch } as Shape) : s,
        ),
      })
    },

    removeShape(id) {
      commitOpenTx()
      pushHistory()
      set({ shapes: get().shapes.filter((s) => s.id !== id) })
    },

    removeShapes(ids) {
      commitOpenTx()
      pushHistory()
      const set_ = new Set(ids)
      set({ shapes: get().shapes.filter((s) => !set_.has(s.id)) })
    },

    bringToFront(id) {
      commitOpenTx()
      pushHistory()
      const z = nextZ++
      set({
        shapes: get().shapes.map((s) => (s.id === id ? { ...s, zIndex: z } : s)),
      })
    },

    sendToBack(id) {
      commitOpenTx()
      pushHistory()
      const minZ = get().shapes.reduce((m, s) => Math.min(m, s.zIndex), 0) - 1
      set({
        shapes: get().shapes.map((s) => (s.id === id ? { ...s, zIndex: minZ } : s)),
      })
    },

    duplicate(id) {
      const orig = get().shapes.find((s) => s.id === id)
      if (!orig) return null
      commitOpenTx()
      pushHistory()
      const z = nextZ++
      const copy: Shape = {
        ...orig,
        id: rid(orig.kind),
        x: orig.x + 24,
        y: orig.y + 24,
        zIndex: z,
      }
      set({ shapes: [...get().shapes, copy] })
      return copy.id
    },

    clear() {
      commitOpenTx()
      pushHistory()
      nextZ = 1
      set({ shapes: [] })
    },

    beginTransaction() {
      commitOpenTx()
      pushHistory()
      txOpen = true
      if (txTimer) clearTimeout(txTimer)
      txTimer = setTimeout(endTransaction, TRANSACTION_AUTOCOMMIT_MS)
    },

    commitTransaction() {
      endTransaction()
    },
  }
})

// Bind shape accessor into history store so undo/redo can read/write
// shapes without a circular import. Lazy on first module evaluation.
useHistoryStore.getState().bindShapesAccessor(
  () => useShapesStore.getState().shapes,
  (shapes) => useShapesStore.getState()._replaceShapes(shapes),
)
