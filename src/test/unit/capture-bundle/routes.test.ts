// Route-level behaviour the module tests cannot reach: a request with no
// bearer (or a bad one) is refused before anything else runs, and an
// unconfigured bucket answers 503 rather than crashing into the GCS SDK.
//
// The ledger and the audit write are mocked here - they have their own tests
// against the real file database and the real Postgres respectively - and
// the GCS module is mocked because these tests must not open real upload
// sessions. The libsql state machine is deliberately NOT re-tested through
// HTTP; ledger.test.ts owns it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BUNDLE_CONTRACT_VERSION } from '@/modules/capture-bundle/contract'

const GOOD_TOKEN = `pfc_${'a'.repeat(40)}`
const SESSION_ID = `bcs_${'b'.repeat(32)}`

const ledger = vi.hoisted(() => ({
  authByToken: vi.fn(async (token: string) =>
    token === `pfc_${'a'.repeat(40)}` ? { orgId: 'org-a', userId: 'user-a' } : null,
  ),
  mintToken: vi.fn(async () => ({ token: `pfc_${'c'.repeat(40)}`, createdAt: 'now' })),
  createSession: vi.fn(async (_auth: unknown, payload: { sessionId: string }) => ({
    sessionId: payload.sessionId,
  })),
  registerChunk: vi.fn(async () => ({ refreshed: false })),
  chunkForVerify: vi.fn(),
  markVerified: vi.fn(),
  finalize: vi.fn(),
}))

vi.mock('@/modules/capture-bundle/ledger', () => ({
  getLedger: () => ledger,
}))

const audit = vi.hoisted(() => ({ writeMobileAudit: vi.fn(async (_args: unknown) => undefined) }))
vi.mock('@/modules/capture-bundle/audit', () => audit)

const gcs = vi.hoisted(() => ({
  initiateResumableUpload: vi.fn(async () => 'https://storage.googleapis.com/upload/fake'),
  verifyObject: vi.fn(),
  objectPathFor: (orgId: string, sessionId: string, seq: number, kind: string) =>
    `captures/${orgId}/${sessionId}/${seq}-${kind}.bin`,
}))
vi.mock('@/modules/capture-bundle/gcs', async importOriginal => {
  const original = await importOriginal<typeof import('@/modules/capture-bundle/gcs')>()
  // `captureUploadsEnabled` stays real: the 503 behaviour under test IS the
  // env check. Only the functions that would touch the network are faked.
  return { ...original, ...gcs }
})

const webSession = vi.hoisted(() => ({ userId: '', orgId: '' as string | null }))
vi.mock('@/modules/auth/session', () => ({
  getSession: async () =>
    webSession.userId ? { user: { id: webSession.userId, orgId: webSession.orgId } } : null,
  getOrgId: (s: { user: { orgId: string | null } }) => s.user.orgId,
}))

const sessionsRoute = await import('@/app/api/mobile/capture/sessions/route')
const chunksRoute = await import('@/app/api/mobile/capture/sessions/[id]/chunks/route')
const completeRoute = await import(
  '@/app/api/mobile/capture/sessions/[id]/chunks/[seq]/complete/route'
)
const finalizeRoute = await import('@/app/api/mobile/capture/sessions/[id]/finalize/route')
const tokensRoute = await import('@/app/api/mobile/tokens/route')

function post(path: string, body: unknown, token?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function sessionCreateBody(): Record<string, unknown> {
  return {
    contractVersion: BUNDLE_CONTRACT_VERSION,
    sessionId: SESSION_ID,
    address: '123 Main St',
    lat: 33.2,
    lng: -96.8,
    device: { model: 'iPhone14,4', osVersion: '17.5', appVersion: '0.1.0', hasLidar: false },
  }
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const seqParams = (id: string, seq: string) => ({ params: Promise.resolve({ id, seq }) })

beforeEach(() => {
  vi.stubEnv('CAPTURE_BUNDLE_BUCKET', 'test-captures')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('bearer auth on the capture surface', () => {
  it('refuses every capture route without a bearer', async () => {
    const responses = await Promise.all([
      sessionsRoute.POST(post('/api/mobile/capture/sessions', sessionCreateBody())),
      chunksRoute.POST(
        post(`/api/mobile/capture/sessions/${SESSION_ID}/chunks`, {}),
        params(SESSION_ID),
      ),
      completeRoute.POST(
        post(`/api/mobile/capture/sessions/${SESSION_ID}/chunks/0/complete`, {}),
        seqParams(SESSION_ID, '0'),
      ),
      finalizeRoute.POST(
        post(`/api/mobile/capture/sessions/${SESSION_ID}/finalize`, {}),
        params(SESSION_ID),
      ),
    ])
    for (const res of responses) expect(res.status).toBe(401)
    expect(ledger.createSession).not.toHaveBeenCalled()
  })

  it('refuses a token the ledger does not know', async () => {
    const res = await sessionsRoute.POST(
      post('/api/mobile/capture/sessions', sessionCreateBody(), `pfc_${'f'.repeat(40)}`),
    )
    expect(res.status).toBe(401)
  })
})

describe('unconfigured bucket', () => {
  it('answers 503 on every capture route when CAPTURE_BUNDLE_BUCKET is unset', async () => {
    vi.stubEnv('CAPTURE_BUNDLE_BUCKET', '')
    const responses = await Promise.all([
      sessionsRoute.POST(post('/api/mobile/capture/sessions', sessionCreateBody(), GOOD_TOKEN)),
      chunksRoute.POST(
        post(`/api/mobile/capture/sessions/${SESSION_ID}/chunks`, {}, GOOD_TOKEN),
        params(SESSION_ID),
      ),
      completeRoute.POST(
        post(`/api/mobile/capture/sessions/${SESSION_ID}/chunks/0/complete`, {}, GOOD_TOKEN),
        seqParams(SESSION_ID, '0'),
      ),
      finalizeRoute.POST(
        post(`/api/mobile/capture/sessions/${SESSION_ID}/finalize`, {}, GOOD_TOKEN),
        params(SESSION_ID),
      ),
    ])
    for (const res of responses) {
      expect(res.status).toBe(503)
      expect(((await res.json()) as { error: string }).error).toMatch(/not configured/i)
    }
    expect(ledger.createSession).not.toHaveBeenCalled()
  })
})

describe('session create through HTTP', () => {
  it('creates with a good bearer and audits the action', async () => {
    const res = await sessionsRoute.POST(
      post('/api/mobile/capture/sessions', sessionCreateBody(), GOOD_TOKEN),
    )
    expect(res.status).toBe(201)
    expect((await res.json()) as object).toMatchObject({ ok: true, sessionId: SESSION_ID })
    expect(audit.writeMobileAudit).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: 'mobile.capture.session.create', ok: true }),
    )
  })

  it('answers 409 for a future contract version, 400 for junk', async () => {
    const future = await sessionsRoute.POST(
      post('/api/mobile/capture/sessions', { ...sessionCreateBody(), contractVersion: 99 }, GOOD_TOKEN),
    )
    expect(future.status).toBe(409)

    const junk = await sessionsRoute.POST(
      post('/api/mobile/capture/sessions', { hello: 'there' }, GOOD_TOKEN),
    )
    expect(junk.status).toBe(400)
  })
})

describe('chunk register through HTTP', () => {
  it('hands back the upload URI and keeps it out of the audit row', async () => {
    const res = await chunksRoute.POST(
      post(
        `/api/mobile/capture/sessions/${SESSION_ID}/chunks`,
        { seq: 1, kind: 'frames', bytes: 1024, sha256: 'ab'.repeat(32) },
        GOOD_TOKEN,
      ),
      params(SESSION_ID),
    )
    expect(res.status).toBe(201)
    expect((await res.json()) as object).toMatchObject({
      ok: true,
      uploadUrl: 'https://storage.googleapis.com/upload/fake',
    })
    const call = audit.writeMobileAudit.mock.calls.at(-1)?.[0]
    expect(JSON.stringify(call)).not.toContain('storage.googleapis.com')
  })
})

describe('tokens route', () => {
  it('refuses without a web session', async () => {
    webSession.userId = ''
    const res = await tokensRoute.POST(post('/api/mobile/tokens', {}))
    expect(res.status).toBe(401)
  })

  it('mints once for a signed-in session and never audits the token', async () => {
    webSession.userId = 'user-a'
    webSession.orgId = 'org-a'
    const res = await tokensRoute.POST(post('/api/mobile/tokens', { label: 'test phone' }))
    webSession.userId = ''
    expect(res.status).toBe(201)
    const body = (await res.json()) as { token: string }
    expect(body.token).toMatch(/^pfc_[0-9a-f]{40}$/)
    const call = audit.writeMobileAudit.mock.calls.at(-1)?.[0]
    expect(JSON.stringify(call)).not.toContain(body.token)
  })
})
