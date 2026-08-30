import { z } from 'zod'

// Shared contract for the site-import feature. Commands, routes, the survey
// store, and the renderer all import from here; nothing redefines these
// shapes locally.

/** Geo parameters persisted in rootJson.survey.geo. The satellite image
 * itself is never stored (Google ToS): these parameters re-fetch it through
 * the authenticated proxy at view time. */
export const surveyGeoSchema = z.object({
  lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180),
  zoom: z.number().int().min(15).max(21),
  // Requested Static Maps dimensions (scale=2 doubles the bitmap density).
  mapWidthPx: z.number().int().min(64).max(640),
  mapHeightPx: z.number().int().min(64).max(640),
})
export type SurveyGeo = z.infer<typeof surveyGeoSchema>

export const latLngSchema = z.object({
  lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180),
})

/** One address suggestion, as returned by the autocomplete proxy route. */
export const addressSuggestionSchema = z.object({
  placeId: z.string().min(1),
  description: z.string().min(1),
})
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>

/** Output of site.import.satellite, consumed verbatim by the client handler
 * that writes the survey store. All dimensions in editor inches; x/y are the
 * backdrop's top-left, already snapped to the drag grid by the server. */
export const satelliteImportPayloadSchema = z.object({
  geo: surveyGeoSchema,
  widthInches: z.number().positive(),
  heightInches: z.number().positive(),
  xInches: z.number(),
  yInches: z.number(),
  // Ground resolution provenance for the existing calibration readout.
  inchesPerPixel: z.number().positive(),
})
export type SatelliteImportPayload = z.infer<typeof satelliteImportPayloadSchema>

// Command ids, registered in src/modules/commands/categories/site-geo.ts.
export const SITE_GEO_COMMANDS = {
  addressSet: 'site.address.set',
  importSatellite: 'site.import.satellite',
  importBuilding: 'site.import.building',
  surveyOpacity: 'site.survey.opacity',
} as const

/** Input and echo of site.survey.opacity: the backdrop's transparency. */
export const surveyOpacityPayloadSchema = z.object({
  opacity: z.number().min(0.05).max(1),
})
export type SurveyOpacityPayload = z.infer<typeof surveyOpacityPayloadSchema>

/** Default import: 640x640 at zoom 20 covers roughly a suburban lot. */
export const DEFAULT_SATELLITE = { zoom: 20, mapWidthPx: 640, mapHeightPx: 640 } as const
