// A chosen place, resolved into everything the site-confirm screen needs:
// coordinates, the Solar building footprint, and a satellite image to draw
// them on.
//
// `staticMapUrl` here is a RELATIVE path to `/api/mobile/site/staticmap`,
// not Google's URL. The Google Static Maps URL embeds the API key and the
// rule in `src/modules/site/geo/google.ts` is that it never reaches a
// client; the phone fetches the image through the authenticated proxy with
// the same bearer it used for this call. The contract doc says so too.

import { z } from 'zod'

import { bearerAuth, json, unauthorized } from '@/modules/capture-bundle/http'
import { buildingInsights, mapsEnabled, placeLocation } from '@/modules/site/geo/google'
import { checkMapsProxyBudget } from '@/modules/site/geo/proxy-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  placeId: z.string().min(1).max(300),
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
})

/** Matches DEFAULT_SATELLITE in `src/modules/site/geo/types.ts`: 640x640 at
 * zoom 20 covers roughly a suburban lot. */
const SATELLITE = { zoom: 20, widthPx: 640, heightPx: 640 } as const

export async function GET(req: Request): Promise<Response> {
  const auth = await bearerAuth(req)
  if (!auth) return unauthorized()

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    placeId: url.searchParams.get('placeId') ?? '',
    session: url.searchParams.get('session') ?? undefined,
  })
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid query' }, 400)
  }

  if (!mapsEnabled()) {
    return json({ ok: false, error: 'Address lookup is not configured' }, 503)
  }

  const budget = await checkMapsProxyBudget(req.headers)
  if (!budget.allowed) {
    const res = json({ ok: false, error: 'Too many address lookups. Try again shortly.' }, 429)
    res.headers.set('Retry-After', String(budget.retryAfterSeconds))
    return res
  }

  const location = await placeLocation(parsed.data.placeId, parsed.data.session)
  if (!location) {
    return json({ ok: false, error: 'That address could not be found.' }, 404)
  }

  // The footprint is best-effort: Solar not knowing a building is a null the
  // app answers by letting the person draw the outline, not an error.
  const building = await buildingInsights(location.lat, location.lng)

  const mapPath = new URL('/api/mobile/site/staticmap', 'http://relative.invalid')
  mapPath.searchParams.set('lat', String(location.lat))
  mapPath.searchParams.set('lng', String(location.lng))
  mapPath.searchParams.set('zoom', String(SATELLITE.zoom))
  mapPath.searchParams.set('w', String(SATELLITE.widthPx))
  mapPath.searchParams.set('h', String(SATELLITE.heightPx))

  return json(
    {
      ok: true,
      location: {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: location.formattedAddress,
      },
      footprint: building?.footprint ?? null,
      staticMapUrl: `${mapPath.pathname}${mapPath.search}`,
    },
    200,
  )
}
