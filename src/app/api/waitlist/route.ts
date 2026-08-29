// Public waitlist endpoint. No auth, by definition: the people posting here do
// not have accounts, and cannot get one without going through this.
//
// A thin shell, exactly like `/api/intake/[token]`. Everything that decides
// anything lives in `src/modules/waitlist/`, which is where the tests point.

import { NextResponse } from 'next/server'

import { authClientIpBucket } from '@/modules/auth/request-ip'
import { handleWaitlistSubmission } from '@/modules/waitlist/handler'
import { WAITLIST_MESSAGES } from '@/modules/waitlist/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The methods this endpoint answers. Adding one means adding it here in the
 * same edit: the OPTIONS response and the 405 both read this list, so they
 * cannot drift apart.
 */
const ALLOWED_METHODS = ['POST', 'OPTIONS'] as const
const ALLOW_HEADER = ALLOWED_METHODS.join(', ')

const BASE_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

function respond(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return NextResponse.json(body, { status, headers: { ...BASE_HEADERS, ...extra } })
}

export async function POST(req: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    // Malformed JSON never reaches the handler, so it never spends a bucket.
    // It also cannot have come from the form on the page.
    return respond(400, { ok: false, error: WAITLIST_MESSAGES.invalid })
  }

  const ipBucket = authClientIpBucket(req.headers)
  const outcome = await handleWaitlistSubmission(payload, ipBucket)

  if (outcome.ok) return respond(200, { ok: true, message: WAITLIST_MESSAGES.accepted })

  const extra: Record<string, string> = {}
  if (outcome.status === 429) extra['retry-after'] = String(outcome.retryAfterSeconds)
  return respond(outcome.status, { ok: false, error: outcome.error }, extra)
}

/**
 * No cross-origin access is granted. The page that posts here is served from
 * this origin, so it needs no CORS headers, and a public write endpoint any
 * site may post to from a visitor's browser is a worse endpoint. `Allow` still
 * advertises the method set so the answer lives in one place.
 */
export function OPTIONS(): Response {
  return new NextResponse(null, { status: 204, headers: { ...BASE_HEADERS, allow: ALLOW_HEADER } })
}

function methodNotAllowed(): Response {
  return respond(405, { ok: false, error: 'Method not allowed' }, { allow: ALLOW_HEADER })
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
