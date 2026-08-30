// The Google client's two invariants: an absent key degrades to null/[] with
// no network call ever made, and the Static Maps URL (the one string carrying
// the key) is built exactly as the proxy expects. HTTP is mocked; only Prisma
// must never be.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  autocompleteAddress,
  buildingInsights,
  mapsEnabled,
  placeLocation,
  staticMapUrl,
} from '@/modules/site/geo/google'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
    vi.stubEnv('MAPS_API_KEY', '')
  })

  it('reports the feature off', () => {
    expect(mapsEnabled()).toBe(false)
  })

  it('every function degrades without touching the network', async () => {
    expect(await autocompleteAddress('4128 Maple', 'session-token-1')).toEqual([])
    expect(await placeLocation('place-1')).toBeNull()
    expect(staticMapUrl({ lat: 28, lng: -81, zoom: 20, widthPx: 640, heightPx: 640 })).toBeNull()
    expect(await buildingInsights(28, -81)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a whitespace-only key as absent', () => {
    vi.stubEnv('MAPS_API_KEY', '  \n')
    expect(mapsEnabled()).toBe(false)
  })
})

describe('with a key', () => {
  beforeEach(() => {
    // Secret Manager values can carry a trailing newline; the client must trim.
    vi.stubEnv('MAPS_API_KEY', 'test-key\n')
  })

  it('reports the feature on', () => {
    expect(mapsEnabled()).toBe(true)
  })

  it('builds the satellite Static Maps URL with scale=2 and the trimmed key', () => {
    const url = staticMapUrl({ lat: 28.5, lng: -81.25, zoom: 20, widthPx: 640, heightPx: 400 })
    expect(url).not.toBeNull()
    const parsed = new URL(url as string)
    expect(parsed.origin + parsed.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap')
    expect(parsed.searchParams.get('maptype')).toBe('satellite')
    expect(parsed.searchParams.get('scale')).toBe('2')
    expect(parsed.searchParams.get('center')).toBe('28.5,-81.25')
    expect(parsed.searchParams.get('zoom')).toBe('20')
    expect(parsed.searchParams.get('size')).toBe('640x400')
    expect(parsed.searchParams.get('key')).toBe('test-key')
  })

  it('autocomplete POSTs the new Places API with the key header and street filter', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: 'place-1',
              text: { text: '4128 Maple St, Windermere, FL' },
            },
          },
          // A query-only suggestion carries no placePrediction; it is skipped.
          {},
        ],
      }),
    )

    const suggestions = await autocompleteAddress('4128 Maple', 'session-token-1')
    expect(suggestions).toEqual([
      { placeId: 'place-1', description: '4128 Maple St, Windermere, FL' },
    ])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.input).toBe('4128 Maple')
    expect(body.sessionToken).toBe('session-token-1')
    expect(body.includedPrimaryTypes).toEqual(['street_address'])
  })

  it('autocomplete returns [] on an upstream error without leaking its text', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'key=SECRET' } }, 403))
    expect(await autocompleteAddress('4128 Maple', 'session-token-1')).toEqual([])
  })

  it('place details GETs with the field mask and parses the location', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        location: { latitude: 28.5, longitude: -81.25 },
        formattedAddress: '4128 Maple St, Windermere, FL 34786',
      }),
    )

    const place = await placeLocation('place-1', 'session-token-1')
    expect(place).toEqual({
      lat: 28.5,
      lng: -81.25,
      formattedAddress: '4128 Maple St, Windermere, FL 34786',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/v1/places/place-1')
    expect(parsed.searchParams.get('sessionToken')).toBe('session-token-1')
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'location,formattedAddress',
    )
  })

  it('place details returns null on 404', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404))
    expect(await placeLocation('gone')).toBeNull()
  })

  it('buildingInsights derives the footprint from the bounding box corners', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        boundingBox: {
          sw: { latitude: 28.0001, longitude: -81.0002 },
          ne: { latitude: 28.0003, longitude: -81.0001 },
        },
      }),
    )

    const insights = await buildingInsights(28.0002, -81.00015)
    expect(insights).not.toBeNull()
    expect(insights?.footprint).toEqual([
      { lat: 28.0001, lng: -81.0002 },
      { lat: 28.0001, lng: -81.0001 },
      { lat: 28.0003, lng: -81.0001 },
      { lat: 28.0003, lng: -81.0002 },
    ])

    const [url] = fetchMock.mock.calls[0] as [string]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://solar.googleapis.com/v1/buildingInsights:findClosest',
    )
    expect(parsed.searchParams.get('location.latitude')).toBe('28.0002')
    expect(parsed.searchParams.get('location.longitude')).toBe('-81.00015')
  })

  it('buildingInsights returns null when the Solar API knows no building (404)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
    expect(await buildingInsights(0, 0)).toBeNull()
  })

  it('buildingInsights returns null on a malformed response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ boundingBox: { sw: 'nope' } }))
    expect(await buildingInsights(0, 0)).toBeNull()
  })
})
