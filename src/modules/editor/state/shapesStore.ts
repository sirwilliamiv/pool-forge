'use client'

import { create } from 'zustand'
import { SHAPE_DEFAULTS, type Shape, type ShapeKind } from './shapes'

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
}

let nextZ = 1

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

export const useShapesStore = create<ShapesState>((set, get) => ({
  shapes: [],

  hydrate(shapes) {
    nextZ = shapes.reduce((m, s) => Math.max(m, s.zIndex), 0) + 1
    set({ shapes })
  },

  addShape(kind, x, y) {
    const z = nextZ++
    const shape = defaultsFor(kind, x, y, z)
    set({ shapes: [...get().shapes, shape] })
    return shape.id
  },

  updateShape(id, patch) {
    set({
      shapes: get().shapes.map((s) =>
        s.id === id ? ({ ...s, ...patch } as Shape) : s,
      ),
    })
  },

  removeShape(id) {
    set({ shapes: get().shapes.filter((s) => s.id !== id) })
  },

  removeShapes(ids) {
    const set_ = new Set(ids)
    set({ shapes: get().shapes.filter((s) => !set_.has(s.id)) })
  },

  bringToFront(id) {
    const z = nextZ++
    set({
      shapes: get().shapes.map((s) => (s.id === id ? { ...s, zIndex: z } : s)),
    })
  },

  sendToBack(id) {
    const minZ = get().shapes.reduce((m, s) => Math.min(m, s.zIndex), 0) - 1
    set({
      shapes: get().shapes.map((s) => (s.id === id ? { ...s, zIndex: minZ } : s)),
    })
  },

  duplicate(id) {
    const orig = get().shapes.find((s) => s.id === id)
    if (!orig) return null
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
    nextZ = 1
    set({ shapes: [] })
  },
}))
