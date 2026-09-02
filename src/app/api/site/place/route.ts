// Proxied Place Details for the browser, session-authed.
//
// The web half of the address flow: autocomplete suggests, this resolves the
// chosen placeId to coordinates and the formatted address the documents will
// print. Same rules as the autocomplete proxy: the key stays on the server,
// authentication first, and an unconfigured key answers 503 rather than
// crashing. The staticMapUrl in the response is a RELATIVE path to
// /api/site/staticmap, never Google's own URL, which embeds the key.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getOrgId, getSession } from '@/modules/auth/session'
import { mapsEnabled, placeLocation } from '@/modules/site/geo/google'
import { DEFAULT_SATELLITE } from '@/modules/site/geo/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  placeId: z.string().min(1).max(300),
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
})

export async function GET(req: Request): Promise<Response> {
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  if (!session || !orgId) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    placeId: url.searchParams.get('placeId') ?? '',
    session: url.searchParams.get('session') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid query' }, { status: 400 })
  }

  if (!mapsEnabled()) {
    return NextResponse.json({ ok: false, error: 'Address lookup is not configured' }, { status: 503 })
  }

  const location = await placeLocation(parsed.data.placeId, parsed.data.session)
  if (!location) {
    return NextResponse.json({ ok: false, error: 'That address could not be found.' }, { status: 404 })
  }

  const mapPath = new URL('/api/site/staticmap', 'http://relative.invalid')
  mapPath.searchParams.set('lat', String(location.lat))
  mapPath.searchParams.set('lng', String(location.lng))
  mapPath.searchParams.set('zoom', String(DEFAULT_SATELLITE.zoom))

  return NextResponse.json({
    ok: true,
    location: {
      lat: location.lat,
      lng: location.lng,
      formattedAddress: location.formattedAddress,
    },
    staticMapUrl: `${mapPath.pathname}${mapPath.search}`,
  })
}
