import { create } from 'zustand'

export type CameraView = 'top' | 'front' | 'left' | 'right' | 'iso'

export interface CameraState {
  targetView: CameraView | null
  transitionToken: number
  setView: (v: CameraView) => void
}

export const useCameraStore = create<CameraState>((set) => ({
  targetView: null,
  transitionToken: 0,
  setView: (v) =>
    set((s) => ({ targetView: v, transitionToken: s.transitionToken + 1 })),
}))
