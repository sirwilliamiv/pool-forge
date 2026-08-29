'use client'

import { create } from 'zustand'

/**
 * What the guide is pointing at right now.
 *
 * Transient by design and never persisted: a highlight is a gesture, and a
 * gesture that survived a reload would be a ring around a control nobody asked
 * about.
 */
export interface GuideState {
  /** Target ids currently ringed. Several at once is the normal case. */
  highlighted: string[]
  point: (ids: string[]) => void
  clear: () => void
}

export const useGuideStore = create<GuideState>((set) => ({
  highlighted: [],
  point: (highlighted) => set({ highlighted }),
  clear: () => set({ highlighted: [] }),
}))
