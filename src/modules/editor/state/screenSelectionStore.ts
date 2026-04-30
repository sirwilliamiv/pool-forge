import { create } from 'zustand'

export interface ScreenSelectionState {
  x: number
  y: number
  visible: boolean
  setPosition: (x: number, y: number) => void
  setVisible: (v: boolean) => void
}

export const useScreenSelectionStore = create<ScreenSelectionState>((set) => ({
  x: 0,
  y: 0,
  visible: false,
  setPosition: (x, y) => set({ x, y }),
  setVisible: (visible) => set({ visible }),
}))
