// Authenticated satellite image proxy.
//
// Google's ToS forbids storing Static Maps imagery, so the drawing persists
// only {lat, lng, zoom, px} and the renderer re-fetches tiles through this
// route at view time. The project's coordinates are resolved server-side from
// the org-scoped row, never taken from the request, and the Google URL (which
// embeds the API key) is built and fetched here and never appears in a
// response, redirect, or log line.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { getOrgId, getSession } from '@/modules/auth/session'
import { logGeoFailure } from '@/modules/site/geo/errors'
import { mapsEnabled, staticMapUrl } from '@/modules/site/geo/google'
import { DEFAULT_SATELLITE } from '@/modules/site/geo/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  zoom: z.coerce.number().int().min(15).max(21).default(DEFAULT_SATELLITE.zoom),
  w: z.coerce.number().int().min(64).max(640).default(DEFAULT_SATELLITE.mapWidthPx),
  h: z.coerce.number().int().min(64).max(640).default(DEFAULT_SATELLITE.mapHeightPx),
})

function notFound(): NextResponse {
  const res = NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  if (!session || !orgId) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  const params = await context.params
  if (!params.id) return notFound()

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
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

  // Ownership comes from the row: another org's project id is the same 404 as
  // a project that does not exist.
  const project = await db.project.findFirst({
    where: { id: params.id, orgId },
    select: { latitude: true, longitude: true },
  })
  if (!project || project.latitude === null || project.longitude === null) return notFound()

  const upstreamUrl = staticMapUrl({
    lat: project.latitude,
    lng: project.longitude,
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
    const ref = logGeoFailure('satellite proxy fetch', err)
    return NextResponse.json(
      { ok: false, error: `Satellite imagery is unavailable right now (ref ${ref}).` },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    const ref = logGeoFailure('satellite proxy upstream', { status: upstream.status })
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
      // Private and short-lived, per the design: never a shared cache, and
      // never older than a day.
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
