'use client'

import { create } from 'zustand'

import { useHistoryStore } from './historyStore'

import {
  DEFAULT_FALLOFF,
  emptyGrade,
  parseCaptureProvenance,
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

/**
 * Record the state before a change, so undo can reach it.
 *
 * Grading was added after history existed and was not wired into it, so undo
 * after moving an elevation reverted an unrelated shape change: the ground
 * stayed put and something the user had not touched moved instead.
 */
function pushHistory(state: Pick<GradeState, 'existing' | 'finished'>): void {
  const history = useHistoryStore.getState()
  const shapes = history._getShapes?.() ?? []
  history.pushPast({ shapes, grade: { existing: state.existing, finished: state.finished } })
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
    set((state) => {
      pushHistory(state)
      // Both surfaces together. One enabled and one not would report the whole
      // site as cut or fill the moment it was switched on.
      return {
        existing: { ...state.existing, enabled },
        finished: { ...state.finished, enabled },
      }
    }),

  setBaseElevation: (feet) =>
    set((state) => {
      pushHistory(state)
      return { [state.editing]: { ...state[state.editing], baseElevationFt: feet } } as Partial<GradeState>
    }),

  setFalloff: (falloff) =>
    set((state) => {
      pushHistory(state)
      // Clamped: below one the field oscillates between points, and very high
      // values turn every shot into a plateau with a cliff around it.
      return {
        [state.editing]: { ...state[state.editing], falloff: clamp(falloff, 1, 6) },
      } as Partial<GradeState>
    }),

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
      pushHistory(state)
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
      pushHistory(state)
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
      pushHistory(state)
      const which = state.editing
      const surface = state[which]
      return {
        [which]: { ...surface, points: surface.points.filter((point) => point.id !== id) },
      } as Partial<GradeState>
    }),

  clearPoints: () =>
    set((state) => {
      pushHistory(state)
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
  const capture = parseCaptureProvenance(raw.capture)
  const surface: SiteGrade = {
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
  if (capture !== null) surface.capture = capture
  return surface
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

// Let undo reach the ground, the same way shapesStore does for shapes. Bound
// here rather than imported the other way so neither store depends on the other.
useHistoryStore.getState().bindGradeAccessor(
  () => {
    const { existing, finished } = useGradeStore.getState()
    return { existing, finished }
  },
  ({ existing, finished }) => useGradeStore.setState({ existing, finished }),
)
