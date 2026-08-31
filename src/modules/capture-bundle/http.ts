// The shared HTTP shape of the mobile capture surface.
//
// Every mobile route authenticates the same way (a `pfc_` bearer resolved
// through the ledger), answers the same way (`Cache-Control: no-store`, a
// sentence in `error`, never a parser's complaint), and converts a
// `BundleRejection` to a status the same way. Written once here so the routes
// stay thin enough to read in one screen.

import { NextResponse } from 'next/server'

import { BundleRejection, statusForBundleRejection } from './contract'
import { getLedger, type CaptureAuth } from './ledger'

export function json(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

/**
 * Resolves the `Authorization: Bearer pfc_...` header to an org and user.
 *
 * A missing header, a malformed token and a revoked token are all the same
 * null: the response never says which, because "your token is revoked" is
 * information for whoever stole it.
 */
export async function bearerAuth(req: Request): Promise<CaptureAuth | null> {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  const token = match?.[1]
  if (!token) return null
  return getLedger().authByToken(token)
}

/** The 401 every bearer route answers when `bearerAuth` came back empty. */
export function unauthorized(): NextResponse {
  return json({ ok: false, error: 'Not authenticated' }, 401)
}

/** The 503 every capture route answers when `CAPTURE_BUNDLE_BUCKET` is unset:
 * same pattern as `mapsEnabled()`, an unconfigured feature is off, not broken. */
export function notConfigured(): NextResponse {
  return json({ ok: false, error: 'Capture uploads are not configured' }, 503)
}

/**
 * A `BundleRejection` as a response: the sentence, the mapped status, and any
 * machine-readable detail (`missingSeqs`) spread alongside. Anything else is
 * a 500 with a fixed sentence - never the underlying error's text, which can
 * carry library internals or key fragments.
 */
export function rejectionResponse(err: unknown): NextResponse {
  if (err instanceof BundleRejection) {
    return json(
      { ok: false, error: err.message, ...(err.detail ?? {}) },
      statusForBundleRejection(err.code),
    )
  }
  console.error('[capture-bundle] unexpected failure', err)
  return json({ ok: false, error: 'Something went wrong on our side. Try again.' }, 500)
}

/** Reads and parses a JSON body without ever echoing it back. */
export async function readJson(req: Request): Promise<unknown | BundleRejection> {
  try {
    return (await req.json()) as unknown
  } catch {
    return new BundleRejection('MALFORMED', 'That request body was not readable JSON.')
  }
}
