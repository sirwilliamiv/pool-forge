import { create } from 'zustand'

import { DEFAULT_GRID, gridInches, type GridSpacingId, type Point } from '@/lib/geometry/drawing'

/**
 * Drawing in plan: the grid, and the path currently being drawn.
 *
 * Separate from `editorStore` because this is transient. A half-drawn line is
 * not part of the drawing and must never reach persistence: `EditorPersistence`
 * subscribes to the shapes store, so keeping the in-progress path here means a
 * save cannot capture a path the user is still deciding about, and abandoning
 * one leaves nothing behind.
 */
export interface DrawState {
  /** Which grid the plan snaps to. */
  gridSpacing: GridSpacingId
  /** Whether snapping applies at all. Holding a modifier suspends it live. */
  snapEnabled: boolean
  /** Vertices committed so far in the path being drawn, in inches. */
  draft: Point[]
  /** Where the pointer is now, so the next segment can be previewed. */
  cursor: Point | null
  /** Set while a freehand drag is in progress. */
  freehand: boolean

  setGridSpacing: (id: GridSpacingId) => void
  toggleSnap: () => void
  setSnap: (on: boolean) => void

  beginDraft: (point: Point) => void
  addDraftPoint: (point: Point) => void
  setCursor: (point: Point | null) => void
  setFreehand: (on: boolean) => void
  /** Undo the last committed vertex, which is what backspace means mid-draw. */
  popDraftPoint: () => void
  clearDraft: () => void
}

export const useDrawStore = create<DrawState>((set) => ({
  gridSpacing: DEFAULT_GRID,
  snapEnabled: true,

  draft: [],
  cursor: null,
  freehand: false,

  setGridSpacing: (gridSpacing) => set({ gridSpacing }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setSnap: (snapEnabled) => set({ snapEnabled }),

  beginDraft: (point) => set({ draft: [point], cursor: point }),
  addDraftPoint: (point) => set((state) => ({ draft: [...state.draft, point] })),
  setCursor: (cursor) => set({ cursor }),
  setFreehand: (freehand) => set({ freehand }),
  popDraftPoint: () => set((state) => ({ draft: state.draft.slice(0, -1) })),
  clearDraft: () => set({ draft: [], cursor: null, freehand: false }),
}))

/** The spacing in inches to snap to right now, or 0 when snapping is off. */
export function activeSnapInches(state: Pick<DrawState, 'gridSpacing' | 'snapEnabled'>): number {
  return state.snapEnabled ? gridInches(state.gridSpacing) : 0
}
