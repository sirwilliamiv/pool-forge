// @vitest-environment node
//
// The shared two-gate body reader every public endpoint stands behind. The
// property worth proving is the ordering: an oversize declaration is refused
// without the body being read at all, and a lying declaration is caught by the
// running total. The waitlist route is exercised through the same reader, so
// its refusal mapping (413 for size, 400 for shape) is asserted here too.

import { describe, expect, it, vi, beforeEach } from 'vitest'

import { readBodyCapped } from '@/lib/http/capped-body'

vi.mock('@/modules/waitlist/handler', () => ({
  handleWaitlistSubmission: vi.fn(async () => ({ ok: true })),
}))

import { POST as waitlistPost } from '@/app/api/waitlist/route'
import { handleWaitlistSubmission } from '@/modules/waitlist/handler'

const handlerMock = vi.mocked(handleWaitlistSubmission)

function request(body: string, headers: Record<string, string> = {}): Request {
  // Node's Request does not materialise a Content-Length header for a string
  // body (a browser's fetch sends one on the wire); the reader requires it,
  // so the harness states it the way a browser would.
  return new Request('http://test.local/api/waitlist', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
      ...headers,
    },
    body,
  })
}

/** A request whose Content-Length lies about the bytes that follow. */
function lyingRequest(bytes: Uint8Array, declared: number): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Request('http://test.local/', {
    method: 'POST',
    headers: { 'content-length': String(declared) },
    body: stream,
    // Node's fetch requires this for a streamed body.
    duplex: 'half',
  } as RequestInit)
}

beforeEach(() => {
  handlerMock.mockClear()
})

describe('readBodyCapped', () => {
  it('refuses an oversize declaration without draining the body', async () => {
    // An endless stream: if the reader drained the body before checking the
    // declaration, this test would hang rather than fail. Returning promptly
    // is the proof that gate 1 runs before a byte is read.
    const chunk = new Uint8Array(1024)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk)
      },
    })
    const req = new Request('http://test.local/', {
      method: 'POST',
      headers: { 'content-length': '1000001' },
      body: stream,
      duplex: 'half',
    } as RequestInit)

    const result = await readBodyCapped(req, 1_000_000)
    expect(result).toEqual({ ok: false, reason: 'too_large' })
  })

  it('refuses a missing Content-Length outright', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
    const req = new Request('http://test.local/', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)
    req.headers.delete('content-length')

    const result = await readBodyCapped(req, 1_000)
    expect(result).toEqual({ ok: false, reason: 'missing_length' })
  })

  it('catches a Content-Length that understates the actual bytes', async () => {
    const bytes = new TextEncoder().encode('x'.repeat(2_000))
    const result = await readBodyCapped(lyingRequest(bytes, 10), 1_000)
    expect(result).toEqual({ ok: false, reason: 'too_large' })
  })

  it('returns the exact bytes when the body is inside the ceiling', async () => {
    const result = await readBodyCapped(request('{"a":1}'), 1_000)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.buffer.toString('utf8')).toBe('{"a":1}')
  })

  it('with requireContentLength:false, accepts a missing length but still stream-caps', async () => {
    // The monitoring reporter's mode: keepalive/beacon POSTs omit the header.
    const small = new TextEncoder().encode('{"ok":true}')
    const noLenSmall = new Request('http://test.local/', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(small)
          c.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)
    noLenSmall.headers.delete('content-length')
    const ok = await readBodyCapped(noLenSmall, 1_000, { requireContentLength: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.buffer.toString('utf8')).toBe('{"ok":true}')

    // A no-length body over the ceiling is still aborted by gate 2.
    const big = new TextEncoder().encode('x'.repeat(2_000))
    const noLenBig = new Request('http://test.local/', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(big)
          c.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)
    noLenBig.headers.delete('content-length')
    const refused = await readBodyCapped(noLenBig, 1_000, { requireContentLength: false })
    expect(refused).toEqual({ ok: false, reason: 'too_large' })
  })
})

describe('the waitlist route stands behind the reader', () => {
  it('answers 413 to an oversize body and never calls the handler', async () => {
    const res = await waitlistPost(request(JSON.stringify({ note: 'x'.repeat(20_000) })))
    expect(res.status).toBe(413)
    expect(handlerMock).not.toHaveBeenCalled()
  })

  it('answers 400 to malformed JSON without spending a bucket', async () => {
    const res = await waitlistPost(request('{not json'))
    expect(res.status).toBe(400)
    expect(handlerMock).not.toHaveBeenCalled()
  })

  it('passes a well-formed submission through', async () => {
    const res = await waitlistPost(request(JSON.stringify({ email: 'a@b.test' })))
    expect(res.status).toBe(200)
    expect(handlerMock).toHaveBeenCalledOnce()
  })
})
