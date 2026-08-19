// Route test for org-scoped blob reads. Hits the real DB and the real
// local-disk BlobStore; only the session is faked, because there is no browser
// here to hold one.

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ userId: '', orgId: '' as string | null }))

vi.mock('@/modules/auth/session', () => ({
  getSession: async () =>
    session.userId ? { user: { id: session.userId, orgId: session.orgId } } : null,
  getOrgId: (s: { user: { orgId: string | null } }) => s.user.orgId,
}))

const { db } = await import('@/lib/db')
const { ingestImage } = await import('@/modules/imports/ingest')
const { resetVariantCache } = await import('@/modules/imports/ingest/variants')
const { resetBlobStore } = await import('@/modules/storage')
const { GET } = await import('@/app/api/imports/blob/[key]/route')
const { solidPng } = await import('./image-fixtures')

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('blob route tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

function request(key: string, query = '', headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/imports/blob/${encodeURIComponent(key)}${query}`, {
    headers,
  })
}

function params(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) }
}

describe.skipIf(!reachable)('GET /api/imports/blob/[key]', () => {
  let blobRoot = ''
  let orgA = ''
  let orgB = ''
  let userA = ''
  let userB = ''
  let imageA = { id: '', storageKey: '' }
  let imageB = { id: '', storageKey: '' }

  beforeAll(async () => {
    blobRoot = await mkdtemp(join(tmpdir(), 'poolforge-blobroute-'))
    process.env.BLOB_STORE_DRIVER = 'local'
    process.env.BLOB_STORE_LOCAL_DIR = blobRoot
    resetBlobStore()
    resetVariantCache()

    orgA = (await db.organization.create({ data: { name: `Blob A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Blob B ${RUN}` } })).id
    userA = (
      await db.user.create({
        data: { email: `blob-a-${RUN}-${orgA}@example.test`, passwordHash: 'x' },
      })
    ).id
    userB = (
      await db.user.create({
        data: { email: `blob-b-${RUN}-${orgB}@example.test`, passwordHash: 'x' },
      })
    ).id

    const a = await ingestImage({
      bytes: await solidPng({ seed: 41, width: 900, height: 600 }),
      declaredMimeType: null,
      orgId: orgA,
      projectId: null,
      origin: 'BUILDER',
      uploadedBy: null,
    })
    const b = await ingestImage({
      bytes: await solidPng({ seed: 42, width: 900, height: 600 }),
      declaredMimeType: null,
      orgId: orgB,
      projectId: null,
      origin: 'CUSTOMER_INTAKE',
      uploadedBy: null,
    })
    imageA = { id: a.sourceImageId, storageKey: a.storageKey }
    imageB = { id: b.sourceImageId, storageKey: b.storageKey }
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
    await db.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } })
    resetBlobStore()
    resetVariantCache()
    if (blobRoot) await rm(blobRoot, { recursive: true, force: true })
  })

  it('refuses an unauthenticated read', async () => {
    session.userId = ''
    session.orgId = null
    const res = await GET(request(imageA.id), params(imageA.id))
    expect(res.status).toBe(401)
  })

  it('serves an image to its own org', async () => {
    session.userId = userA
    session.orgId = orgA
    const res = await GET(request(imageA.id), params(imageA.id))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('refuses a cross-org fetch by source image id', async () => {
    session.userId = userA
    session.orgId = orgA
    const res = await GET(request(imageB.id), params(imageB.id))
    expect(res.status).toBe(404)

    // And the same id works for the org that owns it, so the 404 is authorization
    // and not a broken fixture.
    session.userId = userB
    session.orgId = orgB
    expect((await GET(request(imageB.id), params(imageB.id))).status).toBe(200)
  })

  it('refuses a replayed storage key from another org', async () => {
    session.userId = userA
    session.orgId = orgA
    const res = await GET(request(imageB.storageKey), params(imageB.storageKey))
    expect(res.status).toBe(404)

    const own = await GET(request(imageA.storageKey), params(imageA.storageKey))
    expect(own.status).toBe(200)
  })

  it('ignores ?v= when addressed by raw storage key', async () => {
    session.userId = userA
    session.orgId = orgA
    const res = await GET(
      request(imageA.storageKey, '?v=thumbnail'),
      params(imageA.storageKey),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('serves a thumbnail with a conditional-request ETag', async () => {
    session.userId = userA
    session.orgId = orgA

    const res = await GET(request(imageA.id, '?v=thumbnail'), params(imageA.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toMatch(/^private, max-age=/)

    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()

    const conditional = await GET(
      request(imageA.id, '?v=thumbnail', { 'if-none-match': etag ?? '' }),
      params(imageA.id),
    )
    expect(conditional.status).toBe(304)
  })

  it('serves the downscaled vision copy without a cacheable response', async () => {
    session.userId = userA
    session.orgId = orgA
    const res = await GET(request(imageA.id, '?v=vision'), params(imageA.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('etag')).toBeNull()
  })

  it('404s an unknown id and a malformed key alike', async () => {
    session.userId = userA
    session.orgId = orgA
    expect((await GET(request('nope'), params('nope'))).status).toBe(404)
    expect((await GET(request('../../etc/passwd'), params('../../etc/passwd'))).status).toBe(404)
  })
})
