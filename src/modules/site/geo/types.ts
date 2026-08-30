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

/** A parcel polygon in editor inches, ready to become a property-line shape. */
export const parcelOutlineSchema = z.object({
  points: z.array(z.object({ xInches: z.number(), yInches: z.number() })).min(3),
  parcelId: z.string().nullable(),
  jurisdiction: z.string().nullable(),
})
export type ParcelOutline = z.infer<typeof parcelOutlineSchema>

// Command ids, registered in src/modules/commands/categories/site-geo.ts.
export const SITE_GEO_COMMANDS = {
  addressSet: 'site.address.set',
  importSatellite: 'site.import.satellite',
  importParcel: 'site.import.parcel',
  importBuilding: 'site.import.building',
} as const

/** Default import: 640x640 at zoom 20 covers roughly a suburban lot. */
export const DEFAULT_SATELLITE = { zoom: 20, mapWidthPx: 640, mapHeightPx: 640 } as const
