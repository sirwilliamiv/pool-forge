import { create } from 'zustand'

export type ViewMode = 'plan' | '3d' | 'section'
export type PresentationMode = 'plan' | 'design' | 'build' | 'customer'
export type LeftTab = 'layers' | 'stencils' | 'materials'
export type RightTab = 'design' | 'specs' | 'quote'

export interface ViewState {
  viewMode: ViewMode
  presentationMode: PresentationMode
  leftTab: LeftTab
  rightTab: RightTab
  setViewMode: (m: ViewMode) => void
  setPresentationMode: (m: PresentationMode) => void
  setLeftTab: (t: LeftTab) => void
  setRightTab: (t: RightTab) => void
}

export const useViewStore = create<ViewState>((set) => ({
  viewMode: '3d',
  presentationMode: 'design',
  leftTab: 'layers',
  rightTab: 'design',
  setViewMode: (viewMode) => set({ viewMode }),
  setPresentationMode: (presentationMode) => set({ presentationMode }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab }),
}))

export interface PresentationFlags {
  showSiteContext: boolean
  showEquipmentPad: boolean
  showConstructionOverlay: boolean
  showPlanOverlay: boolean
  showSelectionChrome: boolean
  showValidationGlows: boolean
  dimmedLighting: boolean
  softerWater: boolean
  forceTopDown: boolean
}

export function presentationFlags(mode: PresentationMode): PresentationFlags {
  switch (mode) {
    case 'plan':
      return {
        showSiteContext: false,
        showEquipmentPad: false,
        showConstructionOverlay: false,
        showPlanOverlay: true,
        showSelectionChrome: true,
        showValidationGlows: true,
        dimmedLighting: false,
        softerWater: false,
        forceTopDown: true,
      }
    case 'build':
      return {
        showSiteContext: true,
        showEquipmentPad: true,
        showConstructionOverlay: true,
        showPlanOverlay: false,
        showSelectionChrome: true,
        showValidationGlows: true,
        dimmedLighting: false,
        softerWater: false,
        forceTopDown: false,
      }
    case 'customer':
      return {
        showSiteContext: true,
        showEquipmentPad: false,
        showConstructionOverlay: false,
        showPlanOverlay: false,
        showSelectionChrome: false,
        showValidationGlows: false,
        dimmedLighting: true,
        softerWater: true,
        forceTopDown: false,
      }
    case 'design':
    default:
      return {
        showSiteContext: true,
        showEquipmentPad: true,
        showConstructionOverlay: false,
        showPlanOverlay: false,
        showSelectionChrome: true,
        showValidationGlows: true,
        dimmedLighting: false,
        softerWater: false,
        forceTopDown: false,
      }
  }
}

export function usePresentationFlags(): PresentationFlags {
  const mode = useViewStore((s) => s.presentationMode)
  return presentationFlags(mode)
}
