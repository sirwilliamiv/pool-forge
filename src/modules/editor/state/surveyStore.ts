'use client'

import { create } from 'zustand'

import type { SurveyGeo } from '@/modules/site/geo/types'

export interface SurveyConfig {
  // Reference to a `SourceImage` row; the bytes live in the BlobStore and are
  // served through an org-scoped authenticated route. Never a data URL: a
  // single 12MP photo base64s to roughly 16MB inside `Drawing.rootJson`, on
  // every save and every load.
  //
  // Empty string when the underlay is a satellite backdrop (`geo` set): the
  // image then comes from the authenticated satellite proxy, never the blob
  // store (Google ToS forbids storing the imagery).
  sourceImageId: string
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
  // Migration bridge, read-only. Drawings saved before the SourceImage
  // migration carry their raster inline; the loader surfaces it here so those
  // drawings still open and still show their underlay. `scripts/migrate-survey-images.ts`
  // clears it. Nothing writes this field.
  legacyImageDataUrl?: string
  // Satellite backdrop parameters. The image itself is never persisted: these
  // re-fetch it through `/api/projects/[id]/satellite` at view time. Validated
  // by `surveyGeoSchema` on the way in from `rootJson`.
  geo?: SurveyGeo
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
