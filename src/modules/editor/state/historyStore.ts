'use client'

import { create } from 'zustand'
import type { SiteGrade } from '../grade/model'
import type { Shape } from './shapes'

const CAPACITY = 100

export interface HistorySnapshot {
  shapes: Shape[]
  /**
   * The site elevations at the same moment.
   *
   * Optional only so a snapshot taken before grading existed still reads. When
   * history held shapes alone, undoing after moving an elevation reverted an
   * unrelated shape change instead: the grade stayed where it was and something
   * the user had not touched moved. Undo is the safety net under every movement
   * in this app, and a safety net with a hole in it is worse than none, because
   * it is trusted.
   */
  grade?: GradeSnapshot | null
}

export interface GradeSnapshot {
  existing: SiteGrade
  finished: SiteGrade
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

  // Bound by gradeStore the same way, and separately, so a build without the
  // grade store still has working undo for shapes.
  _getGrade: (() => GradeSnapshot) | null
  _setGrade: ((grade: GradeSnapshot) => void) | null
  bindGradeAccessor: (
    getter: () => GradeSnapshot,
    setter: (grade: GradeSnapshot) => void,
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

/** Everything undo has to be able to put back. */
function snapshotNow(
  getShapes: () => Shape[],
  getGrade: (() => GradeSnapshot) | null,
): HistorySnapshot {
  const snapshot: HistorySnapshot = { shapes: getShapes() }
  if (getGrade) snapshot.grade = getGrade()
  return snapshot
}

function trim(stack: HistorySnapshot[]): HistorySnapshot[] {
  return stack.length > CAPACITY ? stack.slice(stack.length - CAPACITY) : stack
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],
  _getShapes: null,
  _setShapes: null,
  _getGrade: null,
  _setGrade: null,

  bindShapesAccessor: (getter, setter) => {
    if (get()._getShapes) return  // bind once
    set({ _getShapes: getter, _setShapes: setter })
  },

  bindGradeAccessor: (getter, setter) => {
    if (get()._getGrade) return  // bind once
    set({ _getGrade: getter, _setGrade: setter })
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
    const { _getShapes, _setShapes, _getGrade, _setGrade } = get()
    if (!_getShapes || !_setShapes) return
    const previous = get().popPast()
    if (!previous) return
    get().pushFuture(snapshotNow(_getShapes, _getGrade))
    _setShapes(previous.shapes)
    // Only when the snapshot carried one. Restoring an absent grade would wipe
    // elevations recorded after a snapshot taken before grading existed.
    if (previous.grade && _setGrade) _setGrade(previous.grade)
  },

  redo: () => {
    const { _getShapes, _setShapes, _getGrade, _setGrade } = get()
    if (!_getShapes || !_setShapes) return
    const next = get().popFuture()
    if (!next) return
    set((s) => ({ past: trim([...s.past, snapshotNow(_getShapes, _getGrade)]) }))
    _setShapes(next.shapes)
    if (next.grade && _setGrade) _setGrade(next.grade)
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  reset: () => set({ past: [], future: [] }),
}))
