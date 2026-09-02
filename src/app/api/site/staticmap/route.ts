// Authenticated satellite thumbnail proxy for the browser.
//
// Twin of /api/mobile/site/staticmap with a session check instead of a bearer:
// the project page shows a small map next to a chosen address so the user can
// confirm they picked the right parcel. The Google Static Maps URL embeds the
// API key, so it is built and fetched here and never appears in a response,
// redirect, or log line (the invariant src/modules/site/geo/google.ts states).

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getOrgId, getSession } from '@/modules/auth/session'
import { logGeoFailure } from '@/modules/site/geo/errors'
import { mapsEnabled, staticMapUrl } from '@/modules/site/geo/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  lat: z.coerce.number().finite().min(-85).max(85),
  lng: z.coerce.number().finite().min(-180).max(180),
  zoom: z.coerce.number().int().min(15).max(21).default(19),
  w: z.coerce.number().int().min(64).max(640).default(320),
  h: z.coerce.number().int().min(64).max(640).default(200),
})

export async function GET(req: Request): Promise<Response> {
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  if (!session || !orgId) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get('lat') ?? '',
    lng: url.searchParams.get('lng') ?? '',
    zoom: url.searchParams.get('zoom') ?? undefined,
    w: url.searchParams.get('w') ?? undefined,
    h: url.searchParams.get('h') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid query' }, { status: 400 })
  }

  if (!mapsEnabled()) {
    return NextResponse.json({ ok: false, error: 'Satellite imagery is not configured' }, { status: 503 })
  }

  const upstreamUrl = staticMapUrl({
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    zoom: parsed.data.zoom,
    widthPx: parsed.data.w,
    heightPx: parsed.data.h,
  })
  if (!upstreamUrl) {
    return NextResponse.json({ ok: false, error: 'Satellite imagery is not configured' }, { status: 503 })
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl)
  } catch (err) {
    const ref = logGeoFailure('site staticmap proxy fetch', err)
    return NextResponse.json(
      { ok: false, error: `Satellite imagery is unavailable right now (ref ${ref}).` },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    const ref = logGeoFailure('site staticmap proxy upstream', { status: upstream.status })
    return NextResponse.json(
      { ok: false, error: `Satellite imagery is unavailable right now (ref ${ref}).` },
      { status: 502 },
    )
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
