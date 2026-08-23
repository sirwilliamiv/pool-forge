'use client'

import { create } from 'zustand'

import { normalizeToolId } from '@/modules/editor/interactions/toolIds'

export type ToolMode = 'select' | 'pan' | 'draw'

export type Vec3 = [number, number, number]

interface EditorState {
  activeTool: string
  activeMaterialId: string | null
  activeStencilId: string | null
  mode: ToolMode
  zoom: number
  panX: number
  panY: number
  gridVisible: boolean
  snapEnabled: boolean
  quotePanelOpen: boolean
  measureA: Vec3 | null
  measureB: Vec3 | null

  setActiveTool: (toolId: string) => void
  setActiveMaterial: (materialId: string | null) => void
  setActiveStencil: (stencilId: string | null) => void
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
  setMeasureA: (p: Vec3 | null) => void
  setMeasureB: (p: Vec3 | null) => void
  clearMeasure: () => void
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

export const useEditorStore = create<EditorState>()((set) => ({
  activeTool: 'tool.select',
  activeMaterialId: null,
  activeStencilId: null,
  mode: 'select',
  zoom: 1,
  panX: 0,
  panY: 0,
  gridVisible: true,
  snapEnabled: true,
  quotePanelOpen: false,
  measureA: null,
  measureB: null,

  // Normalized on the way in. The hotkey table sends bare names ('move',
  // 'steps', 'measure') while the Toolbar sends prefixed ids, and every reader
  // (ToolGestures, DragHandler, the Toolbar's active highlight) matches on the
  // prefixed form. Storing the raw value made every keyboard tool shortcut a
  // no-op: pressing M armed 'measure', which nothing recognised, so clicking
  // the canvas measured nothing and reported nothing.
  setActiveTool: (toolId) =>
    set({ activeTool: normalizeToolId(toolId), measureA: null, measureB: null }),
  setActiveMaterial: (materialId) => set({ activeMaterialId: materialId }),
  setActiveStencil: (stencilId) => set({ activeStencilId: stencilId }),
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
  setMeasureA: (measureA) => set({ measureA }),
  setMeasureB: (measureB) => set({ measureB }),
  clearMeasure: () => set({ measureA: null, measureB: null }),
}))
