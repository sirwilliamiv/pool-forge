// Public customer-intake endpoint. No auth: the unguessable token is the
// capability, exactly as with /share/[token].
//
// The route is a thin shell. Everything that matters lives in
// `src/modules/imports/intake/`, which is where the security tests point.

import { NextResponse } from 'next/server'

import { IntakeError, intakeErrorBody, safeIntakeError } from '@/modules/imports/intake/errors'
import { handleIntakeSubmission } from '@/modules/imports/intake/handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The methods this endpoint answers. Adding one here means adding it to
 * `ALLOWED_METHODS` in the same edit: the OPTIONS response and the 405 both
 * read from this list, so they cannot drift apart.
 */
const ALLOWED_METHODS = ['POST', 'OPTIONS'] as const
const ALLOW_HEADER = ALLOWED_METHODS.join(', ')

/**
 * User-scoped data must never be cached by a proxy or a browser, and this
 * endpoint's responses describe a specific submission.
 */
const BASE_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

function respond(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return NextResponse.json(body, { status, headers: { ...BASE_HEADERS, ...extra } })
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params

  try {
    const ack = await handleIntakeSubmission(req, token)
    return respond(200, ack)
  } catch (err) {
    const error =
      err instanceof IntakeError
        ? err
        : safeIntakeError(err, 'unavailable', { stage: 'route' })
    const extra: Record<string, string> = {}
    if (error.code === 'rate_limited') extra['retry-after'] = '3600'
    return respond(error.status, intakeErrorBody(error), extra)
  }
}

/**
 * No cross-origin access is granted. The intake page is served from the same
 * origin as this route, so it needs no CORS headers at all, and a public upload
 * endpoint that any site can post to from a victim's browser is a worse
 * endpoint. `Allow` still advertises the method set, so the answer to
 * "which methods does this take" lives in exactly one place.
 */
export function OPTIONS(): Response {
  return new NextResponse(null, {
    status: 204,
    headers: { ...BASE_HEADERS, allow: ALLOW_HEADER },
  })
}

function methodNotAllowed(): Response {
  return respond(405, { ok: false, error: 'Method not allowed' }, { allow: ALLOW_HEADER })
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
