// The Regrid client's invariants: no key means off with no network call, and
// the GeoJSON outer ring comes back as lat/lng with the closing point dropped.
// HTTP is mocked; only Prisma must never be.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parcelAtPoint, regridEnabled } from '@/modules/site/geo/regrid'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const RING = [
  [-81.001, 28.001],
  [-81.001, 28.002],
  [-81.0, 28.002],
  [-81.0, 28.001],
  [-81.001, 28.001], // GeoJSON closes on itself
]

function feature(fields: Record<string, unknown> = {}) {
  return {
    geometry: { type: 'Polygon', coordinates: [RING] },
    properties: { fields },
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('without a key', () => {
  beforeEach(() => {
    vi.stubEnv('REGRID_API_KEY', '')
  })

  it('reports the feature off and degrades without touching the network', async () => {
    expect(regridEnabled()).toBe(false)
    expect(await parcelAtPoint(28.0015, -81.0005)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('with a key', () => {
  beforeEach(() => {
    // Secret Manager values can carry a trailing newline; the client must trim.
    vi.stubEnv('REGRID_API_KEY', 'regrid-token\n')
  })

  it('reports the feature on', () => {
    expect(regridEnabled()).toBe(true)
  })

  it('requests the point endpoint with the trimmed token and lat/lon params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ parcels: { features: [feature()] } }))
    await parcelAtPoint(28.0015, -81.0005)

    const [url] = fetchMock.mock.calls[0] as [string]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://app.regrid.com/api/v2/parcels/point')
    expect(parsed.searchParams.get('lat')).toBe('28.0015')
    expect(parsed.searchParams.get('lon')).toBe('-81.0005')
    expect(parsed.searchParams.get('token')).toBe('regrid-token')
  })

  it('parses the outer ring to lat/lng, dropping the closing point', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        parcels: {
          features: [feature({ parcelnumb: '28-22-30-1234', county: 'Orange', ll_uuid: 'uuid-1' })],
        },
      }),
    )

    const parcel = await parcelAtPoint(28.0015, -81.0005)
    expect(parcel).not.toBeNull()
    expect(parcel?.polygon).toEqual([
      { lat: 28.001, lng: -81.001 },
      { lat: 28.002, lng: -81.001 },
      { lat: 28.002, lng: -81.0 },
      { lat: 28.001, lng: -81.0 },
    ])
    expect(parcel?.parcelId).toBe('28-22-30-1234')
    expect(parcel?.jurisdiction).toBe('Orange')
  })

  it('falls back to ll_uuid when there is no parcel number', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ parcels: { features: [feature({ ll_uuid: 'uuid-2' })] } }),
    )
    const parcel = await parcelAtPoint(28.0015, -81.0005)
    expect(parcel?.parcelId).toBe('uuid-2')
    expect(parcel?.jurisdiction).toBeNull()
  })

  it('takes the first polygon of a MultiPolygon', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        parcels: {
          features: [
            {
              geometry: { type: 'MultiPolygon', coordinates: [[RING]] },
              properties: { fields: {} },
            },
          ],
        },
      }),
    )
    const parcel = await parcelAtPoint(28.0015, -81.0005)
    expect(parcel?.polygon.length).toBe(4)
  })

  it('accepts a bare FeatureCollection shape too', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ features: [feature()] }))
    const parcel = await parcelAtPoint(28.0015, -81.0005)
    expect(parcel?.polygon.length).toBe(4)
  })

  it('returns null when no parcel covers the point', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ parcels: { features: [] } }))
    expect(await parcelAtPoint(0, 0)).toBeNull()
  })

  it('returns null on an upstream error without leaking its text', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'token=SECRET rejected' }, 500))
    expect(await parcelAtPoint(0, 0)).toBeNull()
  })

  it('returns null when the response is not the shape Regrid documents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ surprise: true }))
    expect(await parcelAtPoint(0, 0)).toBeNull()
  })
})
