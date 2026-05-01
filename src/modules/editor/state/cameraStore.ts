import { create } from 'zustand'

export type CameraView = 'top' | 'front' | 'left' | 'right' | 'iso'

export type Vec3 = [number, number, number]

export interface CameraState {
  targetView: CameraView | null
  transitionToken: number
  framePose: Vec3 | null
  frameTarget: Vec3 | null
  setView: (v: CameraView) => void
  frameSelection: (pose: Vec3, target: Vec3) => void
}

export const useCameraStore = create<CameraState>((set) => ({
  targetView: null,
  transitionToken: 0,
  framePose: null,
  frameTarget: null,
  setView: (v) =>
    set((s) => ({
      targetView: v,
      framePose: null,
      frameTarget: null,
      transitionToken: s.transitionToken + 1,
    })),
  frameSelection: (pose, target) =>
    set((s) => ({
      targetView: null,
      framePose: pose,
      frameTarget: target,
      transitionToken: s.transitionToken + 1,
    })),
}))
