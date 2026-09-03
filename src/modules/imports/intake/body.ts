// Reading the intake route's unauthenticated multipart body.
//
// The two-gate reader (Content-Length refused before a byte is read, then a
// running total while the stream drains) lives in `src/lib/http/capped-body.ts`
// so every public endpoint shares one implementation. This wrapper maps its
// refusal reasons into the intake error vocabulary, and only after both gates
// does the buffer get handed to the standard multipart parser, which is then
// operating on input of known, bounded size.

import { readBodyCapped, type CappedBodyRefusal } from '@/lib/http/capped-body'

import { IntakeError } from './errors'

export interface CappedBodyOptions {
  maxBytes: number
}

const REFUSAL_TO_INTAKE: Record<CappedBodyRefusal, ConstructorParameters<typeof IntakeError>[0]> = {
  missing_length: 'invalid_request',
  invalid_length: 'invalid_request',
  no_body: 'invalid_request',
  too_large: 'too_large',
  empty: 'empty',
}

/**
 * Drain a request body into a Buffer, aborting past `maxBytes`.
 * Throws `IntakeError('too_large')` rather than allocating past the ceiling.
 */
export async function readCappedBody(
  req: Request,
  options: CappedBodyOptions,
): Promise<Buffer> {
  const result = await readBodyCapped(req, options.maxBytes)
  if (!result.ok) throw new IntakeError(REFUSAL_TO_INTAKE[result.reason])
  return result.buffer
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
