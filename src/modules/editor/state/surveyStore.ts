'use client'

import { create } from 'zustand'

export interface SurveyConfig {
  imageDataUrl: string
  // Position + size are in canvas inches (the store-internal unit).
  x: number
  y: number
  widthInches: number
  heightInches: number
  opacity: number
  locked: boolean
  // Calibration provenance — kept so we can re-show "1 ft = N px" later.
  calibrationPxDistance: number
  calibrationRealInches: number
  // Original raster pixel dimensions, captured on upload so calibration
  // can compute proportional scale without reloading the image.
  imageNaturalWidthPx: number
  imageNaturalHeightPx: number
}

interface SurveyState {
  survey: SurveyConfig | null
  setSurvey: (s: SurveyConfig | null) => void
  patchSurvey: (patch: Partial<SurveyConfig>) => void
  setOpacity: (n: number) => void
  setLocked: (b: boolean) => void
  calibrationMode: boolean
  setCalibrationMode: (b: boolean) => void
}

export const useSurveyStore = create<SurveyState>((set, get) => ({
  survey: null,
  calibrationMode: false,

  setSurvey(s) {
    set({ survey: s, calibrationMode: false })
  },

  patchSurvey(patch) {
    const cur = get().survey
    if (!cur) return
    set({ survey: { ...cur, ...patch } })
  },

  setOpacity(n) {
    const cur = get().survey
    if (!cur) return
    const clamped = Math.min(1, Math.max(0, n))
    set({ survey: { ...cur, opacity: clamped } })
  },

  setLocked(b) {
    const cur = get().survey
    if (!cur) return
    set({ survey: { ...cur, locked: b } })
  },

  setCalibrationMode(b) {
    set({ calibrationMode: b })
  },
}))
