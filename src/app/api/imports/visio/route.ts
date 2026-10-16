// Authenticated upload of a Visio stencil file (.vss or .vssx).
//
// Same shape as the image upload route: org resolved before the body is
// touched, a counting reader that stops at the cap, and command-registry
// dispatch. The route never converts anything. It checks the magic bytes,
// stages the buffer and dispatches `stencil.library.preview`, which runs the
// converter and writes the audit row.
//
// Response bodies never echo the converter's output or any library error.

import { NextResponse } from 'next/server'

import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import type { CommandContext } from '@/modules/commands/registry'
import { discardStagedUpload, stageUpload } from '@/modules/imports/ingest/staging'
import { sniffVisio } from '@/modules/imports/visio/sniff'
import {
  LibraryCommand,
  MAX_VISIO_BYTES,
  VISIO_UPLOAD_FIELD,
  VisioMessage,
  type PreviewInput,
} from '@/modules/imports/visio/types'
import { getOrgId, getSession } from '@/modules/auth/session'

initCommands()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Room for the multipart envelope on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024
const MAX_BODY_BYTES = MAX_VISIO_BYTES + MULTIPART_OVERHEAD_BYTES

/** Optional form field that overrides the blob's own name. */
const FILE_NAME_FIELD = 'fileName'
const DEFAULT_FILE_NAME = 'stencil.vss'
const MAX_FILE_NAME_LENGTH = 255
const MULTIPART_TYPE = 'multipart/form-data'

const Message = {
  NOT_AUTHENTICATED: 'Not authenticated',
  NOT_MULTIPART: 'Expected a multipart/form-data upload',
  NO_BODY: 'That upload had no body.',
  UNREADABLE: 'That upload could not be read.',
  BAD_MULTIPART: 'That upload was not a valid multipart body.',
  NO_FILE: 'No file was attached.',
  ONE_FILE: 'Attach one stencil file at a time.',
} as const

function json(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

function fail(error: string, status: number): NextResponse {
  return json({ ok: false, error }, status)
}

class BodyTooLarge extends Error {}

interface BlobLike {
  size: number
  type: string
  name?: unknown
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
    await stream.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks, total)
}

/** The name the library records: the explicit field, else the blob's name, never a path. */
function cleanFileName(field: FormDataEntryValue | null, blob: BlobLike): string {
  const candidates = [typeof field === 'string' ? field : '', typeof blob.name === 'string' ? blob.name : '']
  for (const raw of candidates) {
    const base = raw.split(/[\\/]/).pop() ?? ''
    const cleaned = base.trim().slice(0, MAX_FILE_NAME_LENGTH).trim()
    if (cleaned) return cleaned
  }
  return DEFAULT_FILE_NAME
}

function statusForError(error: string): number {
  if (error === VisioMessage.CONVERTER_MISSING) return 503
  if (error.startsWith(VisioMessage.CONVERT_FAILED)) return 422
  if (error === VisioMessage.NO_MASTERS) return 422
  if (error === VisioMessage.NOT_A_STENCIL) return 415
  return 400
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSession()
  const orgId = session ? getOrgId(session) : null
  const userId = session?.user?.id ?? null
  if (!session || !orgId || !userId) return fail(Message.NOT_AUTHENTICATED, 401)

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith(MULTIPART_TYPE)) return fail(Message.NOT_MULTIPART, 415)

  const declaredLength = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return fail(VisioMessage.TOO_LARGE, 413)
  }
  if (!req.body) return fail(Message.NO_BODY, 400)

  let raw: Buffer
  try {
    raw = await readCapped(req.body, MAX_BODY_BYTES)
  } catch (err) {
    if (err instanceof BodyTooLarge) return fail(VisioMessage.TOO_LARGE, 413)
    return fail(Message.UNREADABLE, 400)
  }

  let form: FormData
  try {
    form = await new Response(new Uint8Array(raw), { headers: { 'content-type': contentType } }).formData()
  } catch {
    return fail(Message.BAD_MULTIPART, 400)
  }

  const files = form
    .getAll(VISIO_UPLOAD_FIELD)
    .map(asBlob)
    .filter((blob): blob is BlobLike => blob !== null)
  const file = files[0]
  if (!file) return fail(Message.NO_FILE, 400)
  if (files.length > 1) return fail(Message.ONE_FILE, 400)
  if (file.size === 0) return fail(VisioMessage.EMPTY, 400)
  if (file.size > MAX_VISIO_BYTES) return fail(VisioMessage.TOO_LARGE, 413)

  const bytes = Buffer.from(await file.arrayBuffer())
  if (sniffVisio(bytes) === null) return fail(VisioMessage.NOT_A_STENCIL, 415)

  const fileName = cleanFileName(form.get(FILE_NAME_FIELD), file)
  const declaredMimeType = typeof file.type === 'string' && file.type ? file.type.slice(0, 255) : null
  const ctx: CommandContext = { userId, orgId }

  const uploadRef = stageUpload({ bytes, declaredMimeType, orgId })
  const input: PreviewInput = { uploadRef, fileName }
  let result
  try {
    result = await dispatchCommand(LibraryCommand.PREVIEW, input, ctx)
  } finally {
    discardStagedUpload(uploadRef)
  }

  if (!result.ok) return fail(result.error, statusForError(result.error))
  return json({ ok: true, data: result.data }, 200)
}
