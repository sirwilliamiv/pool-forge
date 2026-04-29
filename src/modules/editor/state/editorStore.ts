'use client'

import { create } from 'zustand'

export type ToolMode = 'select' | 'pan' | 'draw'

interface EditorState {
  activeTool: string
  mode: ToolMode
  zoom: number
  panX: number
  panY: number
  gridVisible: boolean
  snapEnabled: boolean
  quotePanelOpen: boolean

  setActiveTool: (toolId: string) => void
  setMode: (mode: ToolMode) => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  fitToPage: () => void
  setPan: (x: number, y: number) => void
  toggleGrid: () => void
  toggleSnap: () => void
  toggleQuotePanel: () => void
  setQuotePanel: (open: boolean) => void
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

export const useEditorStore = create<EditorState>()((set) => ({
  activeTool: 'tool.select',
  mode: 'select',
  zoom: 1,
  panX: 0,
  panY: 0,
  gridVisible: true,
  snapEnabled: true,
  quotePanelOpen: false,

  setActiveTool: (toolId) => set({ activeTool: toolId }),
  setMode: (mode) => set({ mode }),
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(MAX_ZOOM, s.zoom * 1.2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(MIN_ZOOM, s.zoom / 1.2) })),
  fitToPage: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setPan: (panX, panY) => set({ panX, panY }),
  toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  toggleQuotePanel: () => set((s) => ({ quotePanelOpen: !s.quotePanelOpen })),
  setQuotePanel: (open) => set({ quotePanelOpen: open }),
}))
