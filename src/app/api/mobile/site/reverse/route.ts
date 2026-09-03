// "Use current location": a GPS fix in, a street address out.
//
// Bearer-authed proxy of the Geocoding API via `reverseGeocode` in
// `src/modules/site/geo/google.ts`. Same rules as every geo proxy: the key
// stays on the server, no upstream error text is ever propagated, and an
// unconfigured key is a 503 the app reads as "type the address instead".

import { z } from 'zod'

import { bearerAuth, json, unauthorized } from '@/modules/capture-bundle/http'
import { mapsEnabled, reverseGeocode } from '@/modules/site/geo/google'
import { checkMapsProxyBudget } from '@/modules/site/geo/proxy-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
})

export async function GET(req: Request): Promise<Response> {
  const auth = await bearerAuth(req)
  if (!auth) return unauthorized()

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get('lat') ?? '',
    lng: url.searchParams.get('lng') ?? '',
  })
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid query' }, 400)
  }

  if (!mapsEnabled()) {
    return json({ ok: false, error: 'Address lookup is not configured' }, 503)
  }

  const budget = await checkMapsProxyBudget(req.headers)
  if (!budget.allowed) {
    const res = json({ ok: false, error: 'Too many requests. Try again shortly.' }, 429)
    res.headers.set('Retry-After', String(budget.retryAfterSeconds))
    return res
  }

  const result = await reverseGeocode(parsed.data.lat, parsed.data.lng)
  if (!result) {
    // Standing somewhere without a street address is not an error; the app
    // falls back to typing one.
    return json({ ok: true, address: null }, 200)
  }

  return json(
    {
      ok: true,
      address: {
        formattedAddress: result.formattedAddress,
        placeId: result.placeId,
        lat: result.lat,
        lng: result.lng,
      },
    },
    200,
  )
}
