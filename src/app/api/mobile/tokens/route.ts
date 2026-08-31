// Where a signed-in person mints the bearer token their phone will use.
//
// Cookie-authed, deliberately: this is the one mobile route a browser calls,
// because a bearer token has to come from somewhere and that somewhere is an
// existing Pool Forge web session (the app shows a QR/copy screen). The raw
// token appears in exactly one response and is never stored or logged; the
// ledger keeps its sha256, the audit row keeps only the label.

import { z } from 'zod'

import { writeMobileAudit } from '@/modules/capture-bundle/audit'
import { json, rejectionResponse } from '@/modules/capture-bundle/http'
import { getLedger } from '@/modules/capture-bundle/ledger'
import { getOrgId, getSession } from '@/modules/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  /** e.g. "Billy's iPhone". For the eventual token-management screen. */
  label: z.string().min(1).max(60).optional(),
})

export async function POST(req: Request): Promise<Response> {
  // Same shape as the heightfield route: `requireSession()` redirects to
  // /login, which is wrong for an API caller. Same org rule, 401 instead.
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  const userId = session?.user?.id ?? null
  if (!session || !orgId || !userId) {
    return json({ ok: false, error: 'Not authenticated' }, 401)
  }

  // The body is optional: an empty POST mints an unlabelled token.
  let raw: unknown = {}
  const text = await req.text()
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text) as unknown
    } catch {
      return json({ ok: false, error: 'That request body was not readable JSON.' }, 400)
    }
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return json({ ok: false, error: 'That token label was not usable.' }, 400)
  }

  const input: { label?: string } = {}
  if (parsed.data.label !== undefined) input.label = parsed.data.label

  try {
    const minted = await getLedger().mintToken({ orgId, userId }, parsed.data.label)
    // The audit row records that a token was minted and what it was called,
    // never the token: this table must not be a second place the secret lives.
    await writeMobileAudit({
      commandId: 'mobile.capture.token.mint',
      orgId,
      userId,
      input,
      ok: true,
      output: { minted: true, createdAt: minted.createdAt },
    })
    return json({ ok: true, token: minted.token, createdAt: minted.createdAt }, 201)
  } catch (err) {
    await writeMobileAudit({
      commandId: 'mobile.capture.token.mint',
      orgId,
      userId,
      input,
      ok: false,
      error: 'token mint failed',
    })
    return rejectionResponse(err)
  }
}
