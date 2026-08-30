// Server client for Google Maps Platform: Places Autocomplete (New), Place
// Details (New), Static Maps URL building, and Solar buildingInsights.
//
// Reads MAPS_API_KEY. An absent key means the feature is off, never a crash:
// every function degrades to null or []. The key never leaves this module
// except embedded in the Static Maps URL, which is why `staticMapUrl` is only
// ever consumed by the server-side satellite proxy route; that URL must never
// be sent to a client or written to a log.
//
// No upstream error text is ever propagated (it can carry the key back out in
// a request URL). Failures log against an err_ ref and degrade.

import { z } from 'zod'

import { logGeoFailure } from '@/modules/site/geo/errors'
import type { LatLng } from '@/modules/site/geo/mercator'
import type { AddressSuggestion } from '@/modules/site/geo/types'

const PLACES_BASE = 'https://places.googleapis.com/v1'
const SOLAR_BASE = 'https://solar.googleapis.com/v1'
const STATIC_MAPS_BASE = 'https://maps.googleapis.com/maps/api/staticmap'

/** Secret Manager values can carry a trailing newline; trim before use. */
function apiKey(): string | null {
  const raw = process.env.MAPS_API_KEY
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function mapsEnabled(): boolean {
  return apiKey() !== null
}

/* -------------------------------------------------- Places Autocomplete */

const autocompleteResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string().min(1),
            text: z.object({ text: z.string().min(1) }).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
})

/**
 * Street-address suggestions for a partial query. `sessionToken` groups the
 * keystrokes and the eventual Place Details call into one billing session.
 */
export async function autocompleteAddress(
  query: string,
  sessionToken: string,
): Promise<AddressSuggestion[]> {
  const key = apiKey()
  if (!key) return []

  let json: unknown
  try {
    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input: query,
        sessionToken,
        includedPrimaryTypes: ['street_address'],
      }),
    })
    if (!res.ok) {
      logGeoFailure('places autocomplete', { status: res.status })
      return []
    }
    json = await res.json()
  } catch (err) {
    logGeoFailure('places autocomplete', err)
    return []
  }

  const parsed = autocompleteResponseSchema.safeParse(json)
  if (!parsed.success) {
    logGeoFailure('places autocomplete response shape', parsed.error.issues)
    return []
  }

  const suggestions: AddressSuggestion[] = []
  for (const entry of parsed.data.suggestions ?? []) {
    const prediction = entry.placePrediction
    if (!prediction) continue
    const description = prediction.text?.text
    if (!description) continue
    suggestions.push({ placeId: prediction.placeId, description })
  }
  return suggestions
}

/* ------------------------------------------------------- Place Details */

const placeDetailsResponseSchema = z.object({
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  formattedAddress: z.string().min(1),
})

export interface PlaceLocation {
  lat: number
  lng: number
  formattedAddress: string
}

/** Resolves a place id to its coordinates and formatted address. */
export async function placeLocation(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceLocation | null> {
  const key = apiKey()
  if (!key) return null

  const url = new URL(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`)
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken)

  let json: unknown
  try {
    const res = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'location,formattedAddress',
      },
    })
    if (!res.ok) {
      if (res.status !== 404) logGeoFailure('place details', { status: res.status })
      return null
    }
    json = await res.json()
  } catch (err) {
    logGeoFailure('place details', err)
    return null
  }

  const parsed = placeDetailsResponseSchema.safeParse(json)
  if (!parsed.success) {
    logGeoFailure('place details response shape', parsed.error.issues)
    return null
  }

  return {
    lat: parsed.data.location.latitude,
    lng: parsed.data.location.longitude,
    formattedAddress: parsed.data.formattedAddress,
  }
}

/* --------------------------------------------------------- Static Maps */

export interface StaticMapParams {
  lat: number
  lng: number
  zoom: number
  widthPx: number
  heightPx: number
}

/**
 * The Static Maps URL for a satellite tile, scale=2.
 *
 * The API key is embedded in this URL. It exists solely for the server-side
 * satellite proxy route to fetch; it must never be returned to a client,
 * placed in a response, or logged.
 */
export function staticMapUrl(params: StaticMapParams): string | null {
  const key = apiKey()
  if (!key) return null
  const url = new URL(STATIC_MAPS_BASE)
  url.searchParams.set('center', `${params.lat},${params.lng}`)
  url.searchParams.set('zoom', String(params.zoom))
  url.searchParams.set('size', `${params.widthPx}x${params.heightPx}`)
  url.searchParams.set('scale', '2')
  url.searchParams.set('maptype', 'satellite')
  url.searchParams.set('key', key)
  return url.toString()
}

/* ------------------------------------------------------------- Solar */

const latLngLiteralSchema = z.object({ latitude: z.number(), longitude: z.number() })

const buildingInsightsResponseSchema = z.object({
  boundingBox: z.object({ sw: latLngLiteralSchema, ne: latLngLiteralSchema }),
})

export interface BuildingFootprint {
  footprint: LatLng[]
}

/**
 * The nearest building's footprint at a location, via Solar buildingInsights.
 *
 * v1 derives the footprint from the building bounding box: four corners, in
 * ring order (sw, se, ne, nw). Roof segments would allow a tighter outline,
 * but the bounding box is what a builder drags into place anyway, and the
 * Solar response's roofSegmentStats carry per-segment boxes rather than a
 * merged outline. A 404 means the Solar API does not know this building,
 * which is a clean null, not an error.
 */
export async function buildingInsights(lat: number, lng: number): Promise<BuildingFootprint | null> {
  const key = apiKey()
  if (!key) return null

  const url = new URL(`${SOLAR_BASE}/buildingInsights:findClosest`)
  url.searchParams.set('location.latitude', String(lat))
  url.searchParams.set('location.longitude', String(lng))
  url.searchParams.set('key', key)

  let json: unknown
  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      if (res.status !== 404) logGeoFailure('solar buildingInsights', { status: res.status })
      return null
    }
    json = await res.json()
  } catch (err) {
    logGeoFailure('solar buildingInsights', err)
    return null
  }

  const parsed = buildingInsightsResponseSchema.safeParse(json)
  if (!parsed.success) {
    logGeoFailure('solar buildingInsights response shape', parsed.error.issues)
    return null
  }

  const { sw, ne } = parsed.data.boundingBox
  const footprint: LatLng[] = [
    { lat: sw.latitude, lng: sw.longitude },
    { lat: sw.latitude, lng: ne.longitude },
    { lat: ne.latitude, lng: ne.longitude },
    { lat: ne.latitude, lng: sw.longitude },
  ]
  return { footprint }
}
