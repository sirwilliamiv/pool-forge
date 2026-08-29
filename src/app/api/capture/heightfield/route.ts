// Where the phone posts a walked yard.
//
// Same three properties the image upload route holds, for the same reasons:
//
//   1. Org scoping resolved before the body is touched. The org on the session
//      is the only org that exists for this request.
//   2. A bounded read. The body goes through a counting reader that cancels the
//      stream the moment it passes the cap, so a 500MB POST is refused after a
//      few megabytes rather than after being buffered whole.
//   3. Command-registry dispatch. The route never converts a capture itself: it
//      stages the parsed document and dispatches `capture.heightfield.ingest`,
//      which is what writes the CommandAuditLog row.
//
// Nothing in a response body echoes the payload, a parser message, or an
// underlying library error.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  MAX_CAPTURE_BODY_BYTES,
  decodeCaptureRejection,
  statusForCaptureRejection,
} from '@/modules/capture/contract'
import { discardStagedCapture, stageCapture } from '@/modules/capture/staging'
import { getOrgId, getSession } from '@/modules/auth/session'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import type { CommandContext } from '@/modules/commands/registry'

initCommands()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Everything about the request that is not the heightfield itself.
 *
 * Sent as headers rather than folded into the JSON document so the capture
 * payload stays exactly the contract in `docs/lidar-capture-contract.md` and
 * the phone never has to mix Pool Forge's project ids into what is otherwise a
 * pure survey artefact.
 */
const headersSchema = z.object({
  projectId: z.string().min(1).max(64),
  anchorXFt: z.coerce.number().finite().optional(),
  anchorYFt: z.coerce.number().finite().optional(),
})

function json(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

class BodyTooLarge extends Error {}

/** Reads a request body into memory, aborting as soon as it exceeds `limit`. */
async function readCapped(stream: ReadableStream<Uint8Array>, limit: number): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > limit) throw new BodyTooLarge()
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
    await stream.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks, total)
}

export async function POST(req: Request): Promise<Response> {
  // `requireOrgId()` redirects to /login, which is right for a page and wrong
  // for a phone: the app gets a 307 to an HTML page it cannot parse. Same org
  // rule, 401 instead.
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  const userId = session?.user?.id ?? null
  if (!session || !orgId || !userId) {
    return json({ ok: false, error: 'Not authenticated' }, 401)
  }

  const fields = headersSchema.safeParse({
    projectId: req.headers.get('x-poolforge-project') ?? undefined,
    anchorXFt: req.headers.get('x-poolforge-anchor-x') ?? undefined,
    anchorYFt: req.headers.get('x-poolforge-anchor-y') ?? undefined,
  })
  if (!fields.success) {
    return json({ ok: false, error: 'That upload did not say which project it belongs to.' }, 400)
  }

  // Cheapest possible reject: believe a Content-Length that is already too big.
  // A missing or lying header changes nothing, the counting reader still caps.
  const declaredLength = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CAPTURE_BODY_BYTES) {
    return json({ ok: false, error: 'That site capture is too large to upload.' }, 413)
  }

  if (!req.body) {
    return json({ ok: false, error: 'That upload had no body.' }, 400)
  }

  let raw: Buffer
  try {
    raw = await readCapped(req.body, MAX_CAPTURE_BODY_BYTES)
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return json({ ok: false, error: 'That site capture is too large to upload.' }, 413)
    }
    return json({ ok: false, error: 'That upload could not be read.' }, 400)
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw.toString('utf8')) as unknown
  } catch {
    // The parser's own message can quote the payload back, which is how a
    // fragment of somebody's survey ends up in a log line or a toast.
    console.warn('[capture] request body was not JSON')
    return json({ ok: false, error: 'That site capture was not readable.' }, 400)
  }

  const ctx: CommandContext = { userId, orgId }
  const captureRef = stageCapture({ payload, orgId })

  const commandInput: {
    captureRef: string
    projectId: string
    anchorXFt?: number
    anchorYFt?: number
  } = { captureRef, projectId: fields.data.projectId }
  if (fields.data.anchorXFt !== undefined) commandInput.anchorXFt = fields.data.anchorXFt
  if (fields.data.anchorYFt !== undefined) commandInput.anchorYFt = fields.data.anchorYFt

  let result
  try {
    result = await dispatchCommand('capture.heightfield.ingest', commandInput, ctx)
  } finally {
    // The command consumes the ref on every path it reaches; this covers the
    // ones where dispatch never got that far.
    discardStagedCapture(captureRef)
  }

  if (!result.ok) {
    const rejection = decodeCaptureRejection(result.error)
    if (rejection) {
      return json({ ok: false, error: rejection.message }, statusForCaptureRejection(rejection.code))
    }
    return json({ ok: false, error: result.error }, 400)
  }

  return json({ ok: true, data: result.data }, 201)
}
