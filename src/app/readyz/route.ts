import { NextResponse } from 'next/server'

// Is this instance able to serve?
//
// Not `/healthz`: Cloud Run's front end intercepts that path with its own 404
// before a request ever reaches the container, so a health check there reports
// a dead app that is perfectly alive.
//
// Deliberately shallow. A check that queries the database turns a slow database
// into an instance the platform kills and replaces, which is how a brief blip
// becomes an outage. This answers whether the process is up and serving; the
// database has its own alerting.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET(): Response {
  return NextResponse.json(
    { ok: true, release: process.env.MONITORING_RELEASE ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
