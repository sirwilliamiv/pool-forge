// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ShapeKind, StencilCategory } from '@prisma/client'

vi.mock('@/modules/auth/session', () => ({
  getSession: async () => ({ user: { id: 'user-route-test', orgId: 'org-route-test' } }),
  getOrgId: (s: { user: { orgId: string } }) => s.user.orgId,
}))

import { db } from '@/lib/db'
import { setStencilConverter } from '@/modules/imports/visio/convert'
import { VISIO_UPLOAD_FIELD, VisioMessage } from '@/modules/imports/visio/types'

let reachable = false
try { await db.$queryRaw`SELECT 1`; reachable = true } catch { console.warn('visio route tests skipped: local Postgres unreachable') }

const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])

function multipart(bytes: Buffer, name: string, extra: Record<string, string> = {}): Request {
  const form = new FormData()
  form.append(VISIO_UPLOAD_FIELD, new Blob([new Uint8Array(bytes)]), name)
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  return new Request('http://localhost/api/imports/visio', { method: 'POST', body: form })
}

describe.skipIf(!reachable)('POST /api/imports/visio', () => {
  let POST: (req: Request) => Promise<Response>
  beforeAll(async () => {
    await db.organization.upsert({ where: { id: 'org-route-test' }, update: {}, create: { id: 'org-route-test', name: 'Route test org' } })
    await db.user.upsert({ where: { id: 'user-route-test' }, update: {}, create: { id: 'user-route-test', email: 'visio-route@poolforge.test', name: 'Route' } })
    ;({ POST } = await import('@/app/api/imports/visio/route'))
  })
  afterEach(() => setStencilConverter(null))

  it('refuses something that is not a stencil before converting', async () => {
    let called = false
    setStencilConverter(async () => { called = true; return { candidates: [], skipped: [] } })
    const res = await POST(multipart(Buffer.from('not a visio file at all'), 'x.vss'))
    expect(res.status).toBe(415)
    expect((await res.json()).error).toBe(VisioMessage.NOT_A_STENCIL)
    expect(called).toBe(false)
  })

  it('refuses a non-multipart body', async () => {
    const res = await POST(new Request('http://localhost/api/imports/visio', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))
    expect(res.status).toBe(415)
  })

  it('stages, dispatches the preview command and returns the preview', async () => {
    setStencilConverter(async () => ({
      skipped: [],
      candidates: [{
        index: 0, name: 'Standard Rectangle', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL,
        drawingWidthIn: 3.125, drawingHeightIn: 1.5, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#00ffff', stroke: '#000000',
        rings: [[{ x: 0, y: 0 }, { x: 3.125, y: 0 }, { x: 3.125, y: 1.5 }, { x: 0, y: 1.5 }]],
      }],
    }))
    const res = await POST(multipart(OLE2, 'Pool.vss'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.fileName).toBe('Pool.vss')
    expect(body.data.candidates[0].name).toBe('Standard Rectangle')
    expect(body.data.candidates[0].rings).toBeUndefined()
    const row = await db.stencilImport.findUnique({ where: { id: body.data.importId } })
    expect(row?.orgId).toBe('org-route-test')
    const audit = await db.commandAuditLog.findFirst({ where: { orgId: 'org-route-test', commandId: 'stencil.library.preview' }, orderBy: { ranAt: 'desc' } })
    expect(audit).not.toBeNull()
  })
})
