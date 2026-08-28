// Where the browser's error boundaries send what they caught.
//
// Unauthenticated on purpose. An error on the login page, or an error that
// broke the session itself, is exactly the error worth hearing about, and a
// reporter that needs a session cannot report the failure of the session. In
// exchange the endpoint is given nothing to be abused for: it reads at most
// 16 KB, validates every field with Zod, rate limits per client-IP bucket,
// stores nothing, queries nothing, and returns a fixed body.
//
// It also touches no database and no auth. See `report-limit.ts` for why the
// limiter here is in-process where the intake limiter is a Postgres counter.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { clientIpBucket } from '@/modules/imports/intake/client-ip'
import { captureError } from '@/modules/monitoring/report'
import { consumeReportBudget } from '@/modules/monitoring/report-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A stack plus a component stack is a few KB; anything larger is not a stack. */
const MAX_BODY_BYTES = 16 * 1024

const reportSchema = z.object({
  ref: z.string().max(32).optional(),
  code: z.string().max(64).optional(),
  name: z.string().max(128).optional(),
  message: z.string().max(4096).optional(),
  digest: z.string().max(128).nullish(),
  route: z.string().max(2048).optional(),
  componentStack: z.string().max(8192).optional(),
  stack: z.string().max(8192).optional(),
})

function noStore(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function POST(req: Request): Promise<Response> {
  const bucket = clientIpBucket(req.headers)
  const decision = consumeReportBudget(bucket)
  if (!decision.allowed) {
    const response = noStore({ ok: false }, 429)
    response.headers.set('Retry-After', String(decision.retryAfterSeconds))
    return response
  }

  const declared = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return noStore({ ok: false }, 413)
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return noStore({ ok: false }, 400)
  }
  // A missing or lying Content-Length is the normal case for `keepalive`
  // fetches, so the real check is on the bytes that arrived.
  if (raw.length > MAX_BODY_BYTES) return noStore({ ok: false }, 413)

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return noStore({ ok: false }, 400)
  }

  const parsed = reportSchema.safeParse(parsedJson)
  if (!parsed.success) return noStore({ ok: false }, 400)

  // Everything below is redacted inside `captureError`. Nothing from this body
  // is echoed back to the caller and nothing is persisted.
  const input = parsed.data
  const error = new Error(input.message ?? '')
  error.name = input.name ?? 'Error'
  if (input.stack !== undefined) error.stack = input.stack

  const report = captureError({
    error,
    code: input.code ?? 'client_error',
    origin: 'client',
    ref: input.ref,
    route: input.route,
    digest: input.digest ?? undefined,
    componentStack: input.componentStack,
  })

  return noStore({ ok: true, errorRef: report.errorRef }, 202)
}

/** Reports are POSTed. A probe gets a small JSON 405, not an HTML error page. */
export function GET(): Response {
  return noStore({ ok: false }, 405)
}
