// The endpoint the browser's error boundaries post to.
//
// It is unauthenticated, so the tests that matter are about what it refuses
// and about what it does with the text a hostile caller can put in it. It
// touches no database and no session, deliberately: this is the path that has
// to work when those are the things that are broken.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { REPORT_LIMIT_PER_WINDOW, resetReportLimiter } from '@/modules/monitoring/report-limit'
import { GET, POST } from '@/app/api/monitoring/report/route'

const CUSTOMER_MESSAGE =
  'Failed to save quote for Margaret Fitzwilliam <margaret.fitzwilliam@example.com>, total $48,750.00'

let logged: string[] = []

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/monitoring/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  resetReportLimiter()
  logged = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/monitoring/report', () => {
  it('accepts a boundary report and echoes back the ref the browser already showed', async () => {
    const response = await POST(
      post({
        ref: 'err_0123456789ab',
        code: 'react_boundary',
        name: 'TypeError',
        message: 'Cannot read properties of undefined',
        digest: '3299871266',
        route: '/projects/clx8f2k9q0000abcdefghijkl',
      }),
    )
    expect(response.status).toBe(202)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = (await response.json()) as { ok: boolean; errorRef: string }
    expect(body.ok).toBe(true)
    // Same ref on the screen and in the log, which is the whole point of it.
    expect(body.errorRef).toBe('err_0123456789ab')
    expect(logged).toHaveLength(1)
    const record = JSON.parse(logged[0] ?? '{}') as Record<string, unknown>
    expect(record.origin).toBe('client')
    expect(record.digest).toBe('3299871266')
    expect(record.route).toBe('/projects/:id')
  })

  it('redacts customer data before it reaches the log', async () => {
    await POST(post({ code: 'react_boundary', name: 'Error', message: CUSTOMER_MESSAGE }))
    const line = (logged[0] ?? '').toLowerCase()
    expect(line).not.toContain('margaret')
    expect(line).not.toContain('fitzwilliam')
    expect(line).not.toContain('margaret.fitzwilliam@example.com')
    expect(line).not.toContain('48,750')
    expect(line).not.toContain('48750')
  })

  it('does not echo the submitted message back to the caller', async () => {
    const response = await POST(
      post({ code: 'react_boundary', name: 'Error', message: CUSTOMER_MESSAGE }),
    )
    const text = await response.text()
    expect(text).not.toContain('Margaret')
    expect(text).not.toContain('48,750')
  })

  it('refuses a body that is not JSON, and one that does not match the schema', async () => {
    expect((await POST(post('not json at all'))).status).toBe(400)
    expect((await POST(post({ message: 12345 }))).status).toBe(400)
  })

  it('refuses an oversized body, whether or not Content-Length says so', async () => {
    const huge = JSON.stringify({ message: 'x'.repeat(20_000) })
    expect((await POST(post(huge))).status).toBe(413)
    expect(
      (await POST(post({ message: 'ok' }, { 'content-length': String(1024 * 1024) }))).status,
    ).toBe(413)
  })

  it('rate limits per client-IP bucket', async () => {
    for (let i = 0; i < REPORT_LIMIT_PER_WINDOW; i += 1) {
      expect((await POST(post({ message: 'boom' }))).status).toBe(202)
    }
    const refused = await POST(post({ message: 'boom' }))
    expect(refused.status).toBe(429)
    expect(refused.headers.get('Retry-After')).toBeTruthy()
    // A different address is unaffected: the bucket is per client, not global.
    const other = await POST(post({ message: 'boom' }, { 'x-forwarded-for': '198.51.100.4' }))
    expect(other.status).toBe(202)
  })

  it('answers a stray GET with small JSON rather than an HTML error page', () => {
    const response = GET()
    expect(response.status).toBe(405)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
