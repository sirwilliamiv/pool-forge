// Authenticated satellite image proxy for the phone.
//
// The Google Static Maps URL embeds the API key, so it is built and fetched
// here and never appears in a response, redirect, or log line (the invariant
// `src/modules/site/geo/google.ts` states). The phone gets this route's path
// from `/api/mobile/site/place` and fetches it with its bearer. Coordinates
// come from the query rather than an org-scoped row because at site-confirm
// time nothing has been persisted yet - there is no row to scope to - and a
// satellite tile of a public lat/lng is not org data; the bearer check is
// what stops the proxy being farmed for free imagery.

import { z } from 'zod'

import { bearerAuth, json, unauthorized } from '@/modules/capture-bundle/http'
import { logGeoFailure } from '@/modules/site/geo/errors'
import { mapsEnabled, staticMapUrl } from '@/modules/site/geo/google'
import { checkMapsProxyBudget } from '@/modules/site/geo/proxy-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  lat: z.coerce.number().finite().min(-85).max(85),
  lng: z.coerce.number().finite().min(-180).max(180),
  zoom: z.coerce.number().int().min(15).max(21).default(20),
  w: z.coerce.number().int().min(64).max(640).default(640),
  h: z.coerce.number().int().min(64).max(640).default(640),
})

export async function GET(req: Request): Promise<Response> {
  const auth = await bearerAuth(req)
  if (!auth) return unauthorized()

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get('lat') ?? '',
    lng: url.searchParams.get('lng') ?? '',
    zoom: url.searchParams.get('zoom') ?? undefined,
    w: url.searchParams.get('w') ?? undefined,
    h: url.searchParams.get('h') ?? undefined,
  })
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid query' }, 400)
  }

  if (!mapsEnabled()) {
    return json({ ok: false, error: 'Satellite imagery is not configured' }, 503)
  }

  const budget = await checkMapsProxyBudget(req.headers)
  if (!budget.allowed) {
    const res = json({ ok: false, error: 'Too many map requests. Try again shortly.' }, 429)
    res.headers.set('Retry-After', String(budget.retryAfterSeconds))
    return res
  }

  const upstreamUrl = staticMapUrl({
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    zoom: parsed.data.zoom,
    widthPx: parsed.data.w,
    heightPx: parsed.data.h,
  })
  if (!upstreamUrl) {
    return json({ ok: false, error: 'Satellite imagery is not configured' }, 503)
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl)
  } catch (err) {
    const ref = logGeoFailure('mobile satellite proxy fetch', err)
    return json({ ok: false, error: `Satellite imagery is unavailable right now (ref ${ref}).` }, 502)
  }

  if (!upstream.ok) {
    const ref = logGeoFailure('mobile satellite proxy upstream', { status: upstream.status })
    return json({ ok: false, error: `Satellite imagery is unavailable right now (ref ${ref}).` }, 502)
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer())
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      // Private and short-lived: never a shared cache, never older than a day.
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
