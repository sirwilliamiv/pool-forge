'use client'

import { create } from 'zustand'
import { SHAPE_DEFAULTS, ShapeKind, type Shape } from './shapes'
import { useHistoryStore } from './historyStore'
import { getStencil } from '@/modules/editor/stencils'

const TRANSACTION_AUTOCOMMIT_MS = 800

interface AddShapeOptions {
  stencilId?: string
  width?: number
  height?: number
}

interface ShapesState {
  shapes: Shape[]
  hydrate: (shapes: Shape[]) => void
  addShape: (kind: ShapeKind, x: number, y: number, opts?: AddShapeOptions) => string
  addStencil: (stencilId: string, x: number, y: number) => string
  updateShape: (id: string, patch: Partial<Shape>) => void
  renameShape: (id: string, name: string) => void
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

function defaultsFor(
  kind: ShapeKind,
  x: number,
  y: number,
  z: number,
  opts?: AddShapeOptions,
): Shape {
  let width = opts?.width ?? SHAPE_DEFAULTS[kind].width
  let height = opts?.height ?? SHAPE_DEFAULTS[kind].height
  if (kind === ShapeKind.STENCIL && opts?.stencilId) {
    const s = getStencil(opts.stencilId)
    if (s) {
      const factor = s.defaultDimensions.unit === 'ft' ? 12 : 1
      width = opts.width ?? s.defaultDimensions.width * factor
      height = opts.height ?? s.defaultDimensions.height * factor
    }
  }
  const base = {
    id: rid(kind),
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex: z,
    locked: false,
    hidden: false,
    // Kept whatever kind this became. It used to be written only in the STENCIL
    // branch, so every shape with a dedicated mesh — a pool, a spa, a sun shelf,
    // a deck — arrived with no catalogue id, and the panel and the voice agent
    // both fell back to reading the raw enum: "SUN_SHELF" rather than
    // "Sun shelf". Exactly backwards, since those are the objects that matter.
    ...(opts?.stencilId ? { stencilId: opts.stencilId } : {}),
  }
  switch (kind) {
    case ShapeKind.RECTANGLE_POOL:
      return { ...base, kind: ShapeKind.RECTANGLE_POOL, depthShallow: 3, depthDeep: 5 }
    case ShapeKind.POLYGON_POOL:
      // Seeded with the bounding-box ring. A real footprint arrives either from
      // the image pipeline or from the freeform draw tool; both replace it.
      return {
        ...base,
        kind: ShapeKind.POLYGON_POOL,
        points: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ],
        depthShallow: 3,
        depthDeep: 5,
      }
    case ShapeKind.CONCRETE_DECK:
    case ShapeKind.PAVER_DECK:
    case ShapeKind.GRASS_AREA:
      return { ...base, kind }
    case ShapeKind.SUN_SHELF:
    case ShapeKind.BENCH:
    case ShapeKind.SPA:
      return { ...base, kind }
    case ShapeKind.STENCIL:
      return { ...base, kind: ShapeKind.STENCIL, stencilId: opts?.stencilId ?? 'unknown' }
  }
}

export const useShapesStore = create<ShapesState>((set, get) => {
  // Snapshot the current shapes into history before a mutation.
  // No-op while a transaction is open beyond the initial push.
  function pushHistory() {
    // Both, always. A snapshot holding only half the drawing means undo puts
    // half of it back, and the other half silently belongs to a different
    // moment in time.
    const history = useHistoryStore.getState()
    const grade = history._getGrade?.()
    history.pushPast(grade ? { shapes: get().shapes, grade } : { shapes: get().shapes })
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

    addShape(kind, x, y, opts) {
      commitOpenTx()
      pushHistory()
      const z = nextZ++
      const shape = defaultsFor(kind, x, y, z, opts)
      set({ shapes: [...get().shapes, shape] })
      return shape.id
    },

    addStencil(stencilId, x, y) {
      return get().addShape(ShapeKind.STENCIL, x, y, { stencilId })
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

    renameShape(id, name) {
      commitOpenTx()
      pushHistory()
      set({
        shapes: get().shapes.map((s) =>
          s.id === id ? ({ ...s, name } as Shape) : s,
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
