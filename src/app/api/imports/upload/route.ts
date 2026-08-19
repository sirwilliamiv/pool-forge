// Authenticated multipart upload for the builder path.
//
// Three properties this route has to hold:
//
//   1. Org scoping, resolved before the body is touched. The org on the session
//      is the only org that exists for this request.
//   2. A bounded read. The body is consumed through a counting reader that
//      cancels the stream the moment it passes the cap, so a 500MB POST is
//      refused after ~15MB rather than after being buffered whole.
//   3. Command-registry dispatch. The route never calls `ingestImage`: it
//      stages the buffer and dispatches `import.image.upload`, which is what
//      writes the CommandAuditLog row.
//
// Response bodies never echo the filename, the declared content type, or any
// underlying library error.

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import type { CommandContext } from '@/modules/commands/registry'
import { decodeRejection, statusForRejection } from '@/modules/imports/ingest/rejection'
import { discardStagedUpload, stageUpload } from '@/modules/imports/ingest/staging'
import { MAX_IMAGES_PER_SESSION, MAX_IMAGE_BYTES, UPLOAD_FILE_FIELD } from '@/modules/imports/ingest/types'
import { getOrgId, getSession } from '@/modules/auth/session'

initCommands()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Room for the multipart envelope on top of the image itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES

const fieldsSchema = z.object({
  sessionId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64).optional(),
})

function json(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

class BodyTooLarge extends Error {}

interface BlobLike {
  size: number
  type: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

function asBlob(value: FormDataEntryValue | null): BlobLike | null {
  if (!value || typeof value === 'string') return null
  const candidate = value as unknown as Partial<BlobLike>
  if (typeof candidate.size !== 'number') return null
  if (typeof candidate.arrayBuffer !== 'function') return null
  return candidate as BlobLike
}

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
    // Cancel unconditionally: on the happy path the stream is already drained
    // and this is a no-op, on the abort path it stops the client mid-send.
    await stream.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks, total)
}

export async function POST(req: Request): Promise<Response> {
  // `requireOrgId()` from the same module redirects to /login, which is right
  // for a page and wrong for an XHR upload: the client gets a 307 to an HTML
  // page it cannot parse. Same helpers, same org rule, 401 instead.
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  const userId = session?.user?.id ?? null
  if (!session || !orgId || !userId) {
    return json({ ok: false, error: 'Not authenticated' }, 401)
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return json({ ok: false, error: 'Expected a multipart/form-data upload' }, 415)
  }

  // Cheapest possible reject: believe a Content-Length that is already too big.
  // A missing or lying header changes nothing, the counting reader still caps.
  const declaredLength = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'That upload is too large.' }, 413)
  }

  if (!req.body) {
    return json({ ok: false, error: 'That upload had no body.' }, 400)
  }

  let raw: Buffer
  try {
    raw = await readCapped(req.body, MAX_BODY_BYTES)
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return json({ ok: false, error: 'That upload is too large.' }, 413)
    }
    return json({ ok: false, error: 'That upload could not be read.' }, 400)
  }

  let form: FormData
  try {
    const body = new Uint8Array(raw)
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return json({ ok: false, error: 'That upload was not a valid multipart body.' }, 400)
  }

  const fields = fieldsSchema.safeParse({
    sessionId: form.get('sessionId') ?? undefined,
    projectId: form.get('projectId') ?? undefined,
  })
  if (!fields.success) {
    return json({ ok: false, error: 'Missing or invalid upload fields.' }, 400)
  }

  // Duck-typed rather than `instanceof Blob`: the Blob that `formData()` yields
  // comes from the fetch implementation, which is not always the same class as
  // the ambient global. `file` is accepted as a singular alias so an older
  // caller keeps working.
  const files = [...form.getAll(UPLOAD_FILE_FIELD), ...form.getAll('file')]
    .map(asBlob)
    .filter((blob): blob is Blob => blob !== null)

  if (files.length === 0) {
    return json({ ok: false, error: 'No file was attached.' }, 400)
  }
  if (files.length > MAX_IMAGES_PER_SESSION) {
    return json(
      { ok: false, error: `Attach at most ${MAX_IMAGES_PER_SESSION} images at a time.` },
      400,
    )
  }
  for (const file of files) {
    if (file.size === 0) return json({ ok: false, error: 'That file is empty.' }, 400)
    if (file.size > MAX_IMAGE_BYTES) return json({ ok: false, error: 'That file is too large.' }, 413)
  }

  const ctx: CommandContext = { userId, orgId }
  const uploaded: unknown[] = []

  // Sequential, not parallel: each upload dispatches a command that reads and
  // writes the same ImportSession, and the per-session image cap has to be
  // counted against the rows the previous file just wrote.
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer())
    const declaredMimeType =
      typeof file.type === 'string' && file.type ? file.type.slice(0, 255) : null

    const uploadRef = stageUpload({ bytes, declaredMimeType, orgId })
    const commandInput: {
      sessionId: string
      uploadRef: string
      origin: 'BUILDER'
      projectId?: string
    } = {
      sessionId: fields.data.sessionId,
      uploadRef,
      origin: 'BUILDER',
    }
    if (fields.data.projectId !== undefined) commandInput.projectId = fields.data.projectId

    let result
    try {
      result = await dispatchCommand('import.image.upload', commandInput, ctx)
    } finally {
      // The command consumes the ref on success and on every handled failure;
      // this covers the paths where dispatch itself never reached the body.
      discardStagedUpload(uploadRef)
    }

    if (!result.ok) {
      // Report the first failure rather than silently keeping a partial batch:
      // the user picked these files together and needs to know one did not land.
      const rejection = decodeRejection(result.error)
      if (rejection) {
        return json(
          { ok: false, error: rejection.message, uploaded },
          statusForRejection(rejection.code),
        )
      }
      return json({ ok: false, error: result.error, uploaded }, 400)
    }
    uploaded.push(result.data)
  }

  return json({ ok: true, data: { uploaded, count: uploaded.length } }, 201)
}
