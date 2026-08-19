// Reading an unauthenticated multipart body without letting it decide how much
// memory the process uses.
//
// The naive version of this route calls `req.formData()` and checks sizes
// afterwards, which means a stranger picks the allocation size and the check
// runs after the damage. Two gates instead, in this order:
//
//   1. `Content-Length`, before the body is touched at all. A declared length
//      over the ceiling is refused without reading a byte, and an absent
//      length is refused outright: this endpoint has no reason to accept a
//      chunked upload of unknown size.
//   2. A running total while the stream is drained. A `Content-Length` is a
//      claim, not a fact, so the reader aborts the moment the actual bytes
//      exceed the ceiling regardless of what the header said.
//
// Only after both gates does the buffer get handed to the standard multipart
// parser, which is now operating on input of known, bounded size.

import { IntakeError } from './errors'

export interface CappedBodyOptions {
  maxBytes: number
}

/**
 * Drain a request body into a Buffer, aborting past `maxBytes`.
 * Throws `IntakeError('too_large')` rather than allocating past the ceiling.
 */
export async function readCappedBody(
  req: Request,
  options: CappedBodyOptions,
): Promise<Buffer> {
  const declared = req.headers.get('content-length')
  if (declared === null) throw new IntakeError('invalid_request')

  const declaredBytes = Number(declared)
  if (!Number.isInteger(declaredBytes) || declaredBytes < 0) {
    throw new IntakeError('invalid_request')
  }
  // Gate 1: refuse before the body is read.
  if (declaredBytes > options.maxBytes) throw new IntakeError('too_large')
  if (declaredBytes === 0) throw new IntakeError('empty')

  const body = req.body
  if (body === null) throw new IntakeError('invalid_request')

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      // Gate 2: the header was a claim; these are the actual bytes.
      if (total > options.maxBytes) throw new IntakeError('too_large')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
    // Stop the peer from continuing to send once we have decided to refuse.
    void body.cancel().catch(() => undefined)
  }

  if (total === 0) throw new IntakeError('empty')
  return Buffer.concat(chunks, total)
}

/**
 * Parse an already-bounded buffer as multipart form data.
 *
 * The buffer is wrapped in a fresh `Request` so the platform's own multipart
 * parser does the work: hand-rolling boundary parsing on attacker-controlled
 * input is exactly the kind of code this route should not contain.
 */
export async function parseCappedFormData(
  buffer: Buffer,
  contentType: string | null,
): Promise<FormData> {
  if (contentType === null || !contentType.toLowerCase().includes('multipart/form-data')) {
    throw new IntakeError('invalid_request')
  }
  try {
    const wrapped = new Request('http://intake.local/', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: new Uint8Array(buffer),
    })
    return await wrapped.formData()
  } catch {
    // Never surface the parser's message: it quotes the malformed input.
    throw new IntakeError('invalid_request')
  }
}
