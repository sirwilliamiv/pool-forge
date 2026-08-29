// Route test for the capture upload. Hits the real DB; only the session is
// faked, exactly as the image upload route's test does.
//
// The three things worth proving at this level, none of which the command test
// can reach: an unauthenticated post is refused before the body is touched, an
// oversized body is refused rather than buffered whole, and a refusal comes
// back with the status the phone needs to decide whether to retry.

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ userId: '', orgId: '' as string | null }))

vi.mock('@/modules/auth/session', () => ({
  getSession: async () =>
    session.userId ? { user: { id: session.userId, orgId: session.orgId } } : null,
  getOrgId: (s: { user: { orgId: string | null } }) => s.user.orgId,
}))

const { db } = await import('@/lib/db')
const { MAX_CAPTURE_BODY_BYTES } = await import('@/modules/capture/contract')
const { POST } = await import('@/app/api/capture/heightfield/route')
const { smallYard, captureId } = await import('@/test/fixtures/yards')

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('capture route tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

function post(body: string | Buffer, headers: Record<string, string>): Request {
  return new Request('http://localhost/api/capture/heightfield', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body as BodyInit,
  })
}

describe.skipIf(!reachable)('POST /api/capture/heightfield', () => {
  let orgId = ''
  let userId = ''
  let projectId = ''

  beforeAll(async () => {
    const org = await db.organization.create({ data: { name: `Route ${RUN}` } })
    orgId = org.id
    const user = await db.user.create({
      data: { email: `route-${RUN}-${orgId}@example.test`, passwordHash: 'x' },
    })
    userId = user.id
    await db.organizationMember.create({ data: { userId, orgId } })
    projectId = (await db.project.create({ data: { orgId, name: `Route ${RUN}` } })).id
    session.userId = userId
    session.orgId = orgId
  })

  afterAll(async () => {
    if (!reachable) return
    await db.commandAuditLog.deleteMany({ where: { orgId } })
    await db.organization.deleteMany({ where: { id: orgId } })
    await db.user.deleteMany({ where: { id: userId } })
    session.userId = ''
    session.orgId = ''
  })

  it('refuses an unauthenticated post', async () => {
    const saved = session.userId
    session.userId = ''
    const res = await POST(
      post(JSON.stringify(smallYard({})), { 'x-poolforge-project': projectId }),
    )
    session.userId = saved
    expect(res.status).toBe(401)
  })

  it('refuses a post that does not say which project it belongs to', async () => {
    const res = await POST(post(JSON.stringify(smallYard({})), {}))
    expect(res.status).toBe(400)
  })

  it('takes a walked yard and answers with the summary', async () => {
    const id = captureId(201)
    const res = await POST(
      post(JSON.stringify(smallYard({ captureId: id })), { 'x-poolforge-project': projectId }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { ok: boolean; data: { captureId: string } }
    expect(body.ok).toBe(true)
    expect(body.data.captureId).toBe(id)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('audits the upload without putting a megabyte of heights in the row', async () => {
    // Command inputs are written verbatim into CommandAuditLog. A 60,000 cell
    // capture is about a megabyte of JSON, and an audit table full of them
    // would be the largest thing in the database while telling a reader nothing
    // the SiteCapture row does not already say. So the route stages the
    // document and dispatches a reference, and this is the assertion that says
    // it kept doing that.
    const id = captureId(204)
    const res = await POST(
      post(JSON.stringify(smallYard({ captureId: id })), { 'x-poolforge-project': projectId }),
    )
    expect(res.status).toBe(201)

    const row = await db.commandAuditLog.findFirst({
      where: { orgId, commandId: 'capture.heightfield.ingest', success: true },
      orderBy: { ranAt: 'desc' },
    })
    expect(row).toBeTruthy()
    const input = JSON.stringify(row?.inputJson ?? {})
    expect(input.length).toBeLessThan(400)
    expect(input).toMatch(/cap_ref_[0-9a-f]{32}/)
    // The useful half is kept: what was ingested, and how much of it was real.
    const output = JSON.stringify(row?.outputJson ?? {})
    expect(output).toContain(id)
    expect(output).toContain('measuredPct')
  })

  it('places the capture where the drawing wants it', async () => {
    const id = captureId(202)
    await POST(
      post(JSON.stringify(smallYard({ captureId: id })), {
        'x-poolforge-project': projectId,
        'x-poolforge-anchor-x': '30',
        'x-poolforge-anchor-y': '-12',
      }),
    )
    const row = await db.siteCapture.findFirst({ where: { orgId, captureId: id } })
    // Thirty feet right and twelve forward of the drawing origin, in inches.
    expect(row?.benchmarkXIn).toBeCloseTo(360, 6)
    expect(row?.benchmarkYIn).toBeCloseTo(-144, 6)
  })

  it('refuses a body it is told is too large without reading it', async () => {
    const res = await POST(
      post(JSON.stringify(smallYard({})), {
        'x-poolforge-project': projectId,
        'content-length': String(MAX_CAPTURE_BODY_BYTES + 1),
      }),
    )
    expect(res.status).toBe(413)
  })

  it('refuses a body that is not JSON, without quoting it back', async () => {
    const secret = 'not json at all, and it mentions 55 Willow Lane'
    const res = await POST(post(secret, { 'x-poolforge-project': projectId }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).not.toMatch(/Willow/)
    expect(body.error).not.toMatch(/JSON\.parse|Unexpected token/)
  })

  it('answers a capture from a newer phone with a conflict, not a bad request', async () => {
    const res = await POST(
      post(JSON.stringify({ ...smallYard({}), contractVersion: 99 }), {
        'x-poolforge-project': projectId,
      }),
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/does not understand/)
  })

  it('answers a capture with nothing measured in it by saying so', async () => {
    const yard = smallYard({ coverage: () => 0, captureId: captureId(203) })
    const res = await POST(post(JSON.stringify(yard), { 'x-poolforge-project': projectId }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/no measured ground/)
  })
})
