// Reading an unauthenticated request body without letting the caller decide
// how much memory the process uses.
//
// The naive version calls `req.json()` or `req.formData()` and checks sizes
// afterwards, which means a stranger picks the allocation size and the check
// runs after the damage. Two gates instead, in this order:
//
//   1. `Content-Length`, before the body is touched at all. A declared length
//      over the ceiling is refused without reading a byte, and an absent
//      length is refused outright: a public endpoint has no reason to accept
//      a chunked upload of unknown size.
//   2. A running total while the stream is drained. A `Content-Length` is a
//      claim, not a fact, so the reader aborts the moment the actual bytes
//      exceed the ceiling regardless of what the header said.
//
// Pure with respect to the app: no error vocabulary of its own beyond the
// reason codes, so each public route maps refusals into whatever its callers
// already understand (`IntakeError`, a 413, a generic 400).

export type CappedBodyRefusal = 'missing_length' | 'invalid_length' | 'too_large' | 'empty' | 'no_body'

export type CappedBodyResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; reason: CappedBodyRefusal }

export interface ReadBodyOptions {
  /**
   * Require a `Content-Length` header (default true).
   *
   * True is right for an upload endpoint, which has no reason to accept a
   * chunked body of unknown size. Set false for a reporter that must tolerate
   * `keepalive`/beacon POSTs, which routinely omit the header: gate 1 is
   * skipped, but gate 2 (the running total) still aborts an oversize stream,
   * so the body is bounded either way.
   */
  requireContentLength?: boolean
}

/** Drain a request body into a Buffer, refusing past `maxBytes`. */
export async function readBodyCapped(
  req: Request,
  maxBytes: number,
  options: ReadBodyOptions = {},
): Promise<CappedBodyResult> {
  const requireLength = options.requireContentLength ?? true
  const declared = req.headers.get('content-length')

  if (declared !== null) {
    const declaredBytes = Number(declared)
    if (!Number.isInteger(declaredBytes) || declaredBytes < 0) {
      if (requireLength) return { ok: false, reason: 'invalid_length' }
    } else {
      // Gate 1: refuse before the body is read.
      if (declaredBytes > maxBytes) return { ok: false, reason: 'too_large' }
      if (declaredBytes === 0) return { ok: false, reason: 'empty' }
    }
  } else if (requireLength) {
    return { ok: false, reason: 'missing_length' }
  }

  const body = req.body
  if (body === null) return { ok: false, reason: 'no_body' }

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
      if (total > maxBytes) return { ok: false, reason: 'too_large' }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
    // Stop the peer from continuing to send once we have decided to refuse.
    void body.cancel().catch(() => undefined)
  }

  if (total === 0) return { ok: false, reason: 'empty' }
  return { ok: true, buffer: Buffer.concat(chunks, total) }
}
