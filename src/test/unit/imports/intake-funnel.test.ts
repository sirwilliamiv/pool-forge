// @vitest-environment node
//
// Security tests for the public intake funnel.
//
// Node environment, not the suite default of jsdom: this exercises a real
// server route, and jsdom's Blob/File implementations are not the ones undici's
// multipart encoder expects, so building a request body under jsdom hangs
// rather than failing. Node is also the runtime the route actually runs in.
//
// These hit the real local Postgres (`pnpm db:up`). Prisma is never mocked:
// the whole point of the rate limiter is that it is a database statement, and
// a mock would assert nothing about the property that matters.
//
// Every unique-indexed value interpolates the run-scoped id so parallel runs
// and incomplete teardown cannot collide.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  MAX_IMAGES_PER_SESSION,
  MAX_IMAGE_BYTES,
  INTAKE_ANALYSIS_STATUS,
  INTAKE_MAX_BODY_BYTES,
  INTAKE_RATE_LIMIT_PER_IP,
} from '@/modules/imports/intake/constants'
import { IntakeError, intakeErrorBody } from '@/modules/imports/intake/errors'
import { handleIntakeSubmission } from '@/modules/imports/intake/handler'
import { setIngestImageImpl } from '@/modules/imports/intake/ingest-seam'
import {
  listIntakeLinks,
  listIntakeSubmissions,
  mintIntakeToken,
  resolveIntakeLink,
} from '@/modules/imports/intake/links'
import { claimQueuedAnalysis } from '@/modules/imports/intake/queue'
import { consumeIpBudget, consumeRateLimit } from '@/modules/imports/intake/rate-limit'
import { landIntakeSubmission } from '@/modules/imports/intake/submission'
import type { IngestInput, IngestResult } from '@/modules/imports/ingest/types'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('intake funnel integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

// ---------------------------------------------------------------------------
// Test doubles and request builders
// ---------------------------------------------------------------------------

/**
 * Stands in for Track I1's `ingestImage`, which has not merged. It writes a
 * real SourceImage row so the org-scoping and landing assertions exercise real
 * database behaviour; it does no byte handling, because byte handling is not
 * this track's code.
 */
function fakeIngest(): (input: IngestInput) => Promise<IngestResult> {
  let n = 0
  return async (input) => {
    n += 1
    const sha256 = `${RUN}${n.toString().padStart(4, '0')}`.padEnd(64, '0').slice(0, 64)
    const row = await db.sourceImage.create({
      data: {
        orgId: input.orgId,
        projectId: input.projectId,
        kind: 'UNKNOWN',
        storageKey: `test/${RUN}/${n}`,
        mimeType: 'image/jpeg',
        bytes: input.bytes.byteLength,
        sha256,
        widthPx: 100,
        heightPx: 100,
        uploadedBy: input.uploadedBy,
        origin: input.origin,
      },
      select: { id: true },
    })
    return {
      sourceImageId: row.id,
      sha256,
      deduped: false,
      widthPx: 100,
      heightPx: 100,
      mimeType: 'image/jpeg',
      storageKey: `test/${RUN}/${n}`,
      visionKey: `test/${RUN}/${n}-vision`,
      thumbnailKey: `test/${RUN}/${n}-thumb`,
    }
  }
}

interface BuildRequestOptions {
  files?: number
  fileBytes?: number
  fields?: Record<string, string>
  headers?: Record<string, string>
  /** Overrides Content-Length without allocating the bytes. */
  declaredLength?: number
}

async function buildRequest(options: BuildRequestOptions = {}): Promise<Request> {
  const form = new FormData()
  for (const [key, value] of Object.entries(options.fields ?? {})) form.set(key, value)
  const count = options.files ?? 1
  const size = options.fileBytes ?? 32
  for (let i = 0; i < count; i += 1) {
    form.append('images', new File([new Uint8Array(size).fill(7)], `photo-${i}.jpg`, {
      type: 'image/jpeg',
    }))
  }

  const encoded = new Request('http://intake.test/', { method: 'POST', body: form })
  const contentType = encoded.headers.get('content-type') ?? 'multipart/form-data'
  const bytes = Buffer.from(await encoded.arrayBuffer())

  const headers: Record<string, string> = {
    'content-type': contentType,
    'content-length': String(options.declaredLength ?? bytes.byteLength),
    'x-forwarded-for': '203.0.113.7',
    ...(options.headers ?? {}),
  }
  return new Request('http://intake.test/', { method: 'POST', headers, body: bytes })
}

/** Runs the handler and returns the same body shape the route would emit. */
async function callHandler(
  token: string,
  options: BuildRequestOptions = {},
): Promise<{ status: number; body: unknown }> {
  const req = await buildRequest(options)
  try {
    const ack = await handleIntakeSubmission(req, token)
    return { status: 200, body: ack }
  } catch (err) {
    if (err instanceof IntakeError) return { status: err.status, body: intakeErrorBody(err) }
    throw err
  }
}

// ---------------------------------------------------------------------------

describe.skipIf(!reachable)('customer intake funnel', () => {
  let orgA = ''
  let orgB = ''
  let activeToken = ''
  let inactiveToken = ''
  let expiredToken = ''
  let orgBToken = ''

  beforeAll(async () => {
    setIngestImageImpl(fakeIngest())

    const a = await db.organization.create({ data: { name: `Intake Test A ${RUN}` } })
    const b = await db.organization.create({ data: { name: `Intake Test B ${RUN}` } })
    orgA = a.id
    orgB = b.id

    activeToken = mintIntakeToken()
    inactiveToken = mintIntakeToken()
    expiredToken = mintIntakeToken()
    orgBToken = mintIntakeToken()

    await db.intakeLink.createMany({
      data: [
        { orgId: orgA, token: activeToken, label: `Active ${RUN}`, active: true },
        { orgId: orgA, token: inactiveToken, label: `Inactive ${RUN}`, active: false },
        {
          orgId: orgA,
          token: expiredToken,
          label: `Expired ${RUN}`,
          active: true,
          expiresAt: new Date(Date.now() - 60_000),
        },
        { orgId: orgB, token: orgBToken, label: `Other org ${RUN}`, active: true },
      ],
    })
  })

  afterAll(async () => {
    setIngestImageImpl(null)
    await db.intakeRateCounter.deleteMany({ where: { bucketKey: { contains: RUN } } })
    // Organization cascades to links, submissions, projects, sessions, images.
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  })

  beforeEach(async () => {
    // A fresh IP budget per test, so ceiling tests do not leak into the others.
    await db.intakeRateCounter.deleteMany({ where: { scope: 'ip' } })
  })

  // -------------------------------------------------------------------------
  // Token resolution: the four failures must be one failure
  // -------------------------------------------------------------------------

  describe('token resolution', () => {
    it('accepts an active, unexpired token and establishes the org', async () => {
      const link = await resolveIntakeLink(activeToken)
      expect(link).not.toBeNull()
      expect(link?.orgId).toBe(orgA)
    })

    it('refuses an expired token', async () => {
      const res = await callHandler(expiredToken)
      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ code: 'link_unavailable' })
    })

    it('refuses an inactive token', async () => {
      const res = await callHandler(inactiveToken)
      expect(res.status).toBe(404)
      expect(res.body).toMatchObject({ code: 'link_unavailable' })
    })

    it('refuses a token that expires exactly now', async () => {
      const token = mintIntakeToken()
      const at = new Date()
      await db.intakeLink.create({
        data: { orgId: orgA, token, label: `Boundary ${RUN}`, active: true, expiresAt: at },
      })
      expect(await resolveIntakeLink(token, at)).toBeNull()
      expect(await resolveIntakeLink(token, new Date(at.getTime() - 1000))).not.toBeNull()
    })

    it('makes a nonexistent token indistinguishable from an inactive one', async () => {
      // Byte-identical, not merely similar: status, body, and every key. A
      // caller must not be able to tell a typo from a revoked link.
      const missing = await callHandler(mintIntakeToken())
      const inactive = await callHandler(inactiveToken)
      const expired = await callHandler(expiredToken)
      const malformed = await callHandler('not a token')

      expect(missing.status).toBe(inactive.status)
      expect(JSON.stringify(missing.body)).toBe(JSON.stringify(inactive.body))
      expect(JSON.stringify(expired.body)).toBe(JSON.stringify(inactive.body))
      expect(JSON.stringify(malformed.body)).toBe(JSON.stringify(inactive.body))
    })

    it('never leaks a correlation ref on a link refusal', async () => {
      // An errorRef on one branch and not another would be a discriminant.
      const res = await callHandler(mintIntakeToken())
      expect(res.body).not.toHaveProperty('errorRef')
    })
  })

  // -------------------------------------------------------------------------
  // Caps
  // -------------------------------------------------------------------------

  describe('upload caps', () => {
    it(`refuses image number ${MAX_IMAGES_PER_SESSION + 1}`, async () => {
      const ok = await callHandler(activeToken, { files: MAX_IMAGES_PER_SESSION })
      expect(ok.status).toBe(200)

      const tooMany = await callHandler(activeToken, { files: MAX_IMAGES_PER_SESSION + 1 })
      expect(tooMany.status).toBe(413)
      expect(tooMany.body).toMatchObject({ code: 'too_many' })
    })

    it('refuses an oversized body from Content-Length, before reading it', async () => {
      // The declared length is over the ceiling while the actual payload is
      // tiny: passing means the refusal happened on the header, not after
      // buffering 120MB of attacker-chosen input.
      const res = await callHandler(activeToken, {
        declaredLength: INTAKE_MAX_BODY_BYTES + 1,
      })
      expect(res.status).toBe(413)
      expect(res.body).toMatchObject({ code: 'too_large' })
    })

    it('refuses a body with no Content-Length at all', async () => {
      const form = new FormData()
      form.append('images', new File([new Uint8Array(16)], 'a.jpg', { type: 'image/jpeg' }))
      const encoded = new Request('http://intake.test/', { method: 'POST', body: form })
      const bytes = Buffer.from(await encoded.arrayBuffer())
      const req = new Request('http://intake.test/', {
        method: 'POST',
        headers: {
          'content-type': encoded.headers.get('content-type') ?? 'multipart/form-data',
          'x-forwarded-for': '203.0.113.7',
        },
        body: bytes,
      })
      // Undici sets Content-Length for a buffer body, so force the absent case.
      req.headers.delete('content-length')

      await expect(handleIntakeSubmission(req, activeToken)).rejects.toMatchObject({
        code: 'invalid_request',
      })
    })

    it('refuses a single file over the per-image ceiling', async () => {
      // A real oversized part, not a faked `size`: the total body is well under
      // the whole-body ceiling, so this can only be caught by the per-file
      // check, and it must be caught before the file reaches ingest.
      const before = await db.sourceImage.count({ where: { orgId: orgA } })
      const res = await callHandler(activeToken, { fileBytes: MAX_IMAGE_BYTES + 1 })

      expect(res.status).toBe(413)
      expect(res.body).toMatchObject({ code: 'too_large' })
      expect(await db.sourceImage.count({ where: { orgId: orgA } })).toBe(before)
    })

    it('refuses a submission with no files', async () => {
      const res = await callHandler(activeToken, { files: 0 })
      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ code: 'empty' })
    })
  })

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  describe('atomic rate limiter', () => {
    it('admits exactly `ceiling` requests and then blocks', async () => {
      const key = `ceiling-${RUN}`
      const results: boolean[] = []
      for (let i = 0; i < 5; i += 1) {
        const decision = await consumeRateLimit({ scope: 'ip', bucketKey: key, ceiling: 3 })
        results.push(decision.allowed)
      }
      expect(results).toEqual([true, true, true, false, false])

      const row = await db.intakeRateCounter.findFirst({ where: { bucketKey: key } })
      expect(row?.count).toBe(3)
    })

    it('holds the ceiling under concurrent callers', async () => {
      // The property an in-memory bucket cannot provide: N racing callers, one
      // statement each, and the total admitted is still the ceiling.
      const key = `race-${RUN}`
      const decisions = await Promise.all(
        Array.from({ length: 12 }, () =>
          consumeRateLimit({ scope: 'ip', bucketKey: key, ceiling: 4 }),
        ),
      )
      expect(decisions.filter((d) => d.allowed).length).toBe(4)

      const row = await db.intakeRateCounter.findFirst({ where: { bucketKey: key } })
      expect(row?.count).toBe(4)
    })

    it('separates the ip and token scopes', async () => {
      const key = `scoped-${RUN}`
      expect((await consumeRateLimit({ scope: 'ip', bucketKey: key, ceiling: 1 })).allowed).toBe(true)
      expect((await consumeRateLimit({ scope: 'ip', bucketKey: key, ceiling: 1 })).allowed).toBe(false)
      // Same key, other scope: untouched.
      expect((await consumeRateLimit({ scope: 'token', bucketKey: key, ceiling: 1 })).allowed).toBe(
        true,
      )
    })

    it('rolls over into a new window', async () => {
      const key = `window-${RUN}`
      const windowMs = 60_000
      const t0 = new Date(1_700_000_000_000)
      expect(
        (await consumeRateLimit({ scope: 'ip', bucketKey: key, ceiling: 1, now: t0, windowMs }))
          .allowed,
      ).toBe(true)
      expect(
        (await consumeRateLimit({ scope: 'ip', bucketKey: key, ceiling: 1, now: t0, windowMs }))
          .allowed,
      ).toBe(false)
      const t1 = new Date(t0.getTime() + windowMs)
      expect(
        (await consumeRateLimit({ scope: 'ip', bucketKey: key, ceiling: 1, now: t1, windowMs }))
          .allowed,
      ).toBe(true)
    })

    it('blocks the route once the per-IP ceiling is spent', async () => {
      const ip = '198.51.100.99'
      for (let i = 0; i < INTAKE_RATE_LIMIT_PER_IP; i += 1) {
        await consumeIpBudget('v4:198.51.100.99')
      }
      const res = await callHandler(activeToken, { headers: { 'x-forwarded-for': ip } })
      expect(res.status).toBe(429)
      expect(res.body).toMatchObject({ code: 'rate_limited' })
    })

    it('spends the IP budget before the token is looked up', async () => {
      // A caller enumerating tokens must pay for every probe, including the
      // ones that hit nothing. Otherwise the ceiling protects nothing.
      const ip = '198.51.100.77'
      for (let i = 0; i < INTAKE_RATE_LIMIT_PER_IP; i += 1) {
        await consumeIpBudget('v4:198.51.100.77')
      }
      const res = await callHandler(mintIntakeToken(), { headers: { 'x-forwarded-for': ip } })
      expect(res.status).toBe(429)
    })

    it('gives two IPv6 addresses in one /64 the same bucket', async () => {
      await callHandler(activeToken, {
        headers: { 'x-forwarded-for': '2001:db8:beef:cafe::1' },
      })
      await callHandler(activeToken, {
        headers: { 'x-forwarded-for': '2001:db8:beef:cafe:ffff:ffff:ffff:ffff' },
      })

      const rows = await db.intakeRateCounter.findMany({
        where: { scope: 'ip', bucketKey: { startsWith: 'v6:2001:db8:beef:cafe' } },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.count).toBe(2)
      expect(rows[0]?.bucketKey).toBe('v6:2001:db8:beef:cafe::/64')
    })

    it('gives a different /64 its own bucket', async () => {
      await callHandler(activeToken, { headers: { 'x-forwarded-for': '2001:db8:1:1::1' } })
      await callHandler(activeToken, { headers: { 'x-forwarded-for': '2001:db8:1:2::1' } })
      const rows = await db.intakeRateCounter.findMany({
        where: { scope: 'ip', bucketKey: { startsWith: 'v6:2001:db8:1:' } },
      })
      expect(rows).toHaveLength(2)
    })

    it('ignores forged hops when choosing the bucket', async () => {
      const real = '198.51.100.42'
      await callHandler(activeToken, { headers: { 'x-forwarded-for': real } })
      await callHandler(activeToken, {
        headers: { 'x-forwarded-for': `9.9.9.9, 8.8.8.8, ${real}` },
      })
      await callHandler(activeToken, {
        headers: { 'x-forwarded-for': `1.1.1.1, ${real}` },
      })

      const rows = await db.intakeRateCounter.findMany({
        where: { scope: 'ip', bucketKey: { in: ['v4:198.51.100.42', 'v4:9.9.9.9', 'v4:1.1.1.1'] } },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.bucketKey).toBe('v4:198.51.100.42')
      expect(rows[0]?.count).toBe(3)
    })
  })

  // -------------------------------------------------------------------------
  // Landing, org scoping, and the analysis queue
  // -------------------------------------------------------------------------

  describe('landing a submission', () => {
    it('creates a draft project, an import session, and attached images in the link org', async () => {
      const before = await db.project.count({ where: { orgId: orgA } })
      const res = await callHandler(activeToken, {
        files: 2,
        fields: {
          customerName: '  Dana Rivera  ',
          email: 'dana@example.com',
          phone: '(555) 010-1234',
          notes: 'Something like the third picture, with a tanning ledge.',
        },
      })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ ok: true, received: 2 })

      const after = await db.project.count({ where: { orgId: orgA } })
      expect(after).toBe(before + 1)

      const submission = await db.intakeSubmission.findFirst({
        where: { orgId: orgA, customerName: 'Dana Rivera' },
        include: { project: true },
      })
      expect(submission).not.toBeNull()
      expect(submission?.email).toBe('dana@example.com')
      expect(submission?.phone).toBe('(555) 010-1234')
      expect(submission?.status).toBe('NEW')
      expect(submission?.project?.status).toBe('DRAFT')
      expect(submission?.project?.orgId).toBe(orgA)

      // Notes reach the field the builder already reads.
      expect(submission?.project?.internalNotes).toContain('tanning ledge')

      const projectId = submission?.projectId ?? ''
      const images = await db.sourceImage.findMany({ where: { orgId: orgA, projectId } })
      expect(images).toHaveLength(2)
      expect(images.every((i) => i.origin === 'CUSTOMER_INTAKE')).toBe(true)

      const session = await db.importSession.findFirst({ where: { orgId: orgA, projectId } })
      expect(session).not.toBeNull()
      expect(session?.status).toBe('DRAFT')
    })

    it('drops an implausible email rather than losing the lead', async () => {
      const res = await callHandler(activeToken, {
        fields: { customerName: `Typo ${RUN}`, email: 'not-an-email', phone: '5550001111' },
      })
      expect(res.status).toBe(200)
      const submission = await db.intakeSubmission.findFirst({
        where: { orgId: orgA, customerName: `Typo ${RUN}` },
      })
      expect(submission?.email).toBeNull()
      expect(submission?.phone).toBe('5550001111')
    })

    it('never returns an internal id to the customer', async () => {
      // The acknowledgement is the whole response. A submission or project id
      // in it would be a handle an anonymous caller could start probing with.
      const res = await callHandler(activeToken)
      const keys = Object.keys(res.body as Record<string, unknown>).sort()
      expect(keys).toEqual(['message', 'ok', 'received'])
    })

    it('is invisible to every other org', async () => {
      await callHandler(activeToken, { fields: { customerName: `Scoped ${RUN}` } })

      const mine = await listIntakeSubmissions(orgA)
      expect(mine.some((s) => s.customerName === `Scoped ${RUN}`)).toBe(true)

      const theirs = await listIntakeSubmissions(orgB)
      expect(theirs.some((s) => s.customerName === `Scoped ${RUN}`)).toBe(false)

      const crossOrgRead = await db.intakeSubmission.findFirst({
        where: { orgId: orgB, customerName: `Scoped ${RUN}` },
      })
      expect(crossOrgRead).toBeNull()

      const linksA = await listIntakeLinks(orgA)
      const linksB = await listIntakeLinks(orgB)
      expect(linksA.some((l) => l.token === activeToken)).toBe(true)
      expect(linksB.some((l) => l.token === activeToken)).toBe(false)
      expect(linksB).toHaveLength(1)
    })

    it('routes a submission to the org that owns the token, not the busiest org', async () => {
      await callHandler(orgBToken, { fields: { customerName: `OrgB lead ${RUN}` } })
      const inB = await db.intakeSubmission.findFirst({
        where: { orgId: orgB, customerName: `OrgB lead ${RUN}` },
      })
      expect(inB).not.toBeNull()
      const leakedToA = await db.intakeSubmission.findFirst({
        where: { orgId: orgA, customerName: `OrgB lead ${RUN}` },
      })
      expect(leakedToA).toBeNull()
    })

    it('counts submissions per link for the builder', async () => {
      const links = await listIntakeLinks(orgB)
      const orgBLink = links.find((l) => l.token === orgBToken)
      expect(orgBLink?.submissionCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('queued analysis', () => {
    it('writes PENDING inside the landing transaction, before any model call', async () => {
      // `landIntakeSubmission` is called directly so nothing has had a chance
      // to claim the row: this asserts the state is durable at commit time,
      // which is what a polling client depends on.
      const link = await resolveIntakeLink(activeToken)
      expect(link).not.toBeNull()
      if (link === null) return

      const image = await db.sourceImage.create({
        data: {
          orgId: orgA,
          kind: 'UNKNOWN',
          storageKey: `test/${RUN}/queue`,
          mimeType: 'image/jpeg',
          bytes: 16,
          sha256: `q${RUN}`.padEnd(64, 'a').slice(0, 64),
          widthPx: 10,
          heightPx: 10,
          origin: 'CUSTOMER_INTAKE',
        },
        select: { id: true },
      })

      const landed = await landIntakeSubmission({
        link,
        contact: { customerName: `Queue ${RUN}`, email: null, phone: null, notes: null },
        sourceImageIds: [image.id],
      })

      const session = await db.importSession.findUnique({
        where: { id: landed.importSessionId },
        select: { analysisStatus: true },
      })
      expect(session?.analysisStatus).toBe(INTAKE_ANALYSIS_STATUS.PENDING)

      // The claim is a conditional update, so exactly one caller wins it.
      const claims = await Promise.all([
        claimQueuedAnalysis(landed.importSessionId),
        claimQueuedAnalysis(landed.importSessionId),
        claimQueuedAnalysis(landed.importSessionId),
      ])
      expect(claims.filter((c) => c !== null)).toHaveLength(1)

      const afterClaim = await db.importSession.findUnique({
        where: { id: landed.importSessionId },
        select: { analysisStatus: true },
      })
      expect(afterClaim?.analysisStatus).toBe(INTAKE_ANALYSIS_STATUS.RUNNING)
    })

    it('leaves nothing queued when a submission carried no images', async () => {
      const link = await resolveIntakeLink(activeToken)
      if (link === null) throw new Error('link should resolve')
      const landed = await landIntakeSubmission({
        link,
        contact: { customerName: `Empty ${RUN}`, email: null, phone: null, notes: null },
        sourceImageIds: [],
      })
      const session = await db.importSession.findUnique({
        where: { id: landed.importSessionId },
        select: { analysisStatus: true },
      })
      expect(session?.analysisStatus).toBe(INTAKE_ANALYSIS_STATUS.NONE)
      expect(await claimQueuedAnalysis(landed.importSessionId)).toBeNull()
    })
  })
})
