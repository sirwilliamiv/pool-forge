// Server client for Regrid parcel-by-point.
//
// Reads REGRID_API_KEY. Optional by design: parcels are a paid add-on, and an
// absent key means the parcel features are off, never a crash. Assessor lines
// are tax-map approximations; the UI says so.
//
// Same error rules as google.ts: no upstream error text propagates (the token
// travels in the query string, so an echoed URL would leak it). Failures log
// against an err_ ref and degrade to null.

import { z } from 'zod'

import { logGeoFailure } from '@/modules/site/geo/errors'
import type { LatLng } from '@/modules/site/geo/mercator'

const REGRID_POINT_URL = 'https://app.regrid.com/api/v2/parcels/point'

/** Secret Manager values can carry a trailing newline; trim before use. */
function token(): string | null {
  const raw = process.env.REGRID_API_KEY
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function regridEnabled(): boolean {
  return token() !== null
}

// A GeoJSON position is [lng, lat, ...]; only the first two matter here.
const positionSchema = z.array(z.number()).min(2)

const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(positionSchema)).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(z.array(positionSchema)).min(1)).min(1),
  }),
])

const featureSchema = z.object({
  geometry: geometrySchema,
  properties: z
    .object({
      fields: z
        .object({
          ll_uuid: z.string().optional().nullable(),
          parcelnumb: z.string().optional().nullable(),
          county: z.string().optional().nullable(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
})

// Regrid v2 wraps the FeatureCollection under `parcels`; tolerate a bare
// FeatureCollection too, since fixtures and older docs use both shapes.
const responseSchema = z.union([
  z.object({ parcels: z.object({ features: z.array(featureSchema) }) }),
  z.object({ features: z.array(featureSchema) }),
])

export interface ParcelAtPoint {
  /** Outer ring of the parcel, in lat/lng, unclosed. */
  polygon: LatLng[]
  parcelId: string | null
  jurisdiction: string | null
}

function outerRing(geometry: z.infer<typeof geometrySchema>): number[][] | null {
  if (geometry.type === 'Polygon') return geometry.coordinates[0] ?? null
  return geometry.coordinates[0]?.[0] ?? null
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** The parcel containing a point, or null when Regrid is off or has none. */
export async function parcelAtPoint(lat: number, lng: number): Promise<ParcelAtPoint | null> {
  const key = token()
  if (!key) return null

  const url = new URL(REGRID_POINT_URL)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('token', key)

  let json: unknown
  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      if (res.status !== 404) logGeoFailure('regrid parcel point', { status: res.status })
      return null
    }
    json = await res.json()
  } catch (err) {
    logGeoFailure('regrid parcel point', err)
    return null
  }

  const parsed = responseSchema.safeParse(json)
  if (!parsed.success) {
    logGeoFailure('regrid parcel point response shape', parsed.error.issues)
    return null
  }

  const features = 'parcels' in parsed.data ? parsed.data.parcels.features : parsed.data.features
  const feature = features[0]
  if (!feature) return null

  const ring = outerRing(feature.geometry)
  if (!ring || ring.length < 3) return null

  const polygon: LatLng[] = []
  for (const position of ring) {
    const [pointLng, pointLat] = position
    if (typeof pointLng !== 'number' || typeof pointLat !== 'number') continue
    polygon.push({ lat: pointLat, lng: pointLng })
  }
  if (polygon.length < 3) return null

  // GeoJSON rings close on themselves; drop the duplicated last point.
  const first = polygon[0]
  const last = polygon[polygon.length - 1]
  if (first && last && polygon.length > 3 && first.lat === last.lat && first.lng === last.lng) {
    polygon.pop()
  }

  const fields = feature.properties?.fields
  return {
    polygon,
    parcelId: cleanText(fields?.parcelnumb) ?? cleanText(fields?.ll_uuid),
    jurisdiction: cleanText(fields?.county),
  }
}
