'use client'

import { create } from 'zustand'

import {
  DEFAULT_FALLOFF,
  emptyGrade,
  type GradePoint,
  type GradePointKind,
  type SiteGrade,
} from '../grade/model'

// The site's elevations, as editable state.
//
// Two grades, not one: what the ground is now, and what it should be when the
// job is done. Netting them into a single surface would make the earthwork
// unrecoverable, and the earthwork is the number that goes on the quote.

export interface GradeState {
  /** Measured ground. What the laser saw. */
  existing: SiteGrade
  /** Design intent. Where the ground ends up. */
  finished: SiteGrade
  /** Which one edits apply to, so the panel and the voice agent agree. */
  editing: 'existing' | 'finished'

  setEditing: (which: 'existing' | 'finished') => void
  setEnabled: (enabled: boolean) => void
  setBaseElevation: (feet: number) => void
  setFalloff: (falloff: number) => void

  addPoint: (input: { x: number; y: number; elevationFt: number; kind?: GradePointKind; label?: string }) => string
  updatePoint: (id: string, patch: Partial<Omit<GradePoint, 'id'>>) => void
  removePoint: (id: string) => void
  clearPoints: () => void

  /** Replace both surfaces without pushing history, for load and undo. */
  hydrate: (payload: { existing?: SiteGrade | null; finished?: SiteGrade | null } | null) => void
}

let counter = 0
function pointId(): string {
  counter += 1
  return `grade-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

export const useGradeStore = create<GradeState>()((set, get) => ({
  existing: emptyGrade(),
  finished: emptyGrade(),
  editing: 'existing',

  setEditing: (editing) => set({ editing }),

  setEnabled: (enabled) =>
    // Both surfaces together. One enabled and one not would report the whole
    // site as cut or fill the moment it was switched on.
    set((state) => ({
      existing: { ...state.existing, enabled },
      finished: { ...state.finished, enabled },
    })),

  setBaseElevation: (feet) =>
    set((state) => ({ [state.editing]: { ...state[state.editing], baseElevationFt: feet } }) as Partial<GradeState>),

  setFalloff: (falloff) =>
    set((state) => ({
      // Clamped: below one the field oscillates between points, and very high
      // values turn every shot into a plateau with a cliff around it.
      [state.editing]: { ...state[state.editing], falloff: clamp(falloff, 1, 6) },
    }) as Partial<GradeState>),

  addPoint: (input) => {
    const id = pointId()
    const point: GradePoint = {
      id,
      x: input.x,
      y: input.y,
      elevationFt: input.elevationFt,
      kind: input.kind ?? (get().editing === 'finished' ? 'finished' : 'existing'),
      ...(input.label ? { label: input.label } : {}),
    }
    set((state) => {
      const which = state.editing
      const surface = state[which]
      return {
        [which]: {
          ...surface,
          points: [...surface.points, point],
          // Adding the first shot is what a person means by "the site is not
          // flat"; making them turn it on separately is a step with no decision
          // in it.
          enabled: true,
        },
      } as Partial<GradeState>
    })
    return id
  },

  updatePoint: (id, patch) =>
    set((state) => {
      const which = state.editing
      const surface = state[which]
      return {
        [which]: {
          ...surface,
          points: surface.points.map((point) => (point.id === id ? { ...point, ...patch } : point)),
        },
      } as Partial<GradeState>
    }),

  removePoint: (id) =>
    set((state) => {
      const which = state.editing
      const surface = state[which]
      return {
        [which]: { ...surface, points: surface.points.filter((point) => point.id !== id) },
      } as Partial<GradeState>
    }),

  clearPoints: () =>
    set((state) => {
      const which = state.editing
      return { [which]: { ...state[which], points: [] } } as Partial<GradeState>
    }),

  hydrate: (payload) =>
    set({
      existing: normalise(payload?.existing),
      finished: normalise(payload?.finished),
    }),
}))

/**
 * Take a surface off the wire.
 *
 * Drawings saved before grading existed have no grade at all, and a drawing
 * saved by a newer build could carry a field this one does not know. Both have
 * to open rather than throw.
 */
function normalise(raw: SiteGrade | null | undefined): SiteGrade {
  if (!raw || typeof raw !== 'object') return emptyGrade()
  const points = Array.isArray(raw.points) ? raw.points : []
  return {
    baseElevationFt: Number.isFinite(raw.baseElevationFt) ? raw.baseElevationFt : 0,
    falloff: Number.isFinite(raw.falloff) ? clamp(raw.falloff, 1, 6) : DEFAULT_FALLOFF,
    enabled: raw.enabled === true,
    points: points
      .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => ({
        id: typeof point.id === 'string' && point.id ? point.id : pointId(),
        x: point.x,
        y: point.y,
        elevationFt: Number.isFinite(point.elevationFt) ? point.elevationFt : 0,
        kind: point.kind === 'finished' || point.kind === 'fixed' ? point.kind : 'existing',
        ...(point.label ? { label: point.label } : {}),
      })),
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
