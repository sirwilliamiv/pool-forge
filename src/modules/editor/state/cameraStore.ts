import { create } from 'zustand'

export type CameraView = 'top' | 'front' | 'left' | 'right' | 'iso'

export type Vec3 = [number, number, number]

/**
 * A relative camera move asked for by command rather than dragged out with a
 * pointer. Zoom is a factor (greater than 1 moves in); pan is in screen pixels,
 * +x right and +y down.
 */
export interface CameraNudge {
  zoom: number
  panX: number
  panY: number
}

export interface CameraState {
  targetView: CameraView | null
  transitionToken: number
  framePose: Vec3 | null
  frameTarget: Vec3 | null
  nudge: CameraNudge | null
  nudgeToken: number
  setView: (v: CameraView) => void
  frameSelection: (pose: Vec3, target: Vec3) => void
  zoomBy: (factor: number) => void
  panBy: (dx: number, dy: number) => void
}

export const useCameraStore = create<CameraState>((set) => ({
  targetView: null,
  transitionToken: 0,
  framePose: null,
  frameTarget: null,
  nudge: null,
  nudgeToken: 0,
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
  // Zoom and pan carry a token because they are relative: two identical
  // zoom-ins in a row leave every value in this store unchanged, and a reader
  // watching values alone would apply the first and ignore the second.
  zoomBy: (factor) =>
    set((s) => ({
      nudge: { zoom: factor, panX: 0, panY: 0 },
      nudgeToken: s.nudgeToken + 1,
    })),
  panBy: (dx, dy) =>
    set((s) => ({
      nudge: { zoom: 1, panX: dx, panY: dy },
      nudgeToken: s.nudgeToken + 1,
    })),
}))
