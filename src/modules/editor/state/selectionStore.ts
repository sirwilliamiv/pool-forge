'use client'

import { create } from 'zustand'

interface SelectionState {
  selectedIds: string[]
  select: (id: string) => void
  deselect: (id: string) => void
  selectMany: (ids: string[]) => void
  toggle: (id: string) => void
  clear: () => void
  isSelected: (id: string) => boolean
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  selectedIds: [],
  select: (id) => set({ selectedIds: [id] }),
  deselect: (id) => set((s) => ({ selectedIds: s.selectedIds.filter((x) => x !== id) })),
  selectMany: (ids) => set({ selectedIds: ids }),
  toggle: (id) =>
    set((s) =>
      s.selectedIds.includes(id)
        ? { selectedIds: s.selectedIds.filter((x) => x !== id) }
        : { selectedIds: [...s.selectedIds, id] },
    ),
  clear: () => set({ selectedIds: [] }),
  isSelected: (id) => get().selectedIds.includes(id),
}))
