import { randomUUID } from 'node:crypto'
import { ShapeKind, StencilCategory } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import { stageUpload } from '@/modules/imports/ingest/staging'
import { setStencilConverter } from '@/modules/imports/visio/convert'
import {
  LibraryCommand, VISIO_SCALE_DEFAULT, VisioMessage,
  type CommitOutput, type ListOutput, type PlaceOutput, type PreviewOutput, type StoredCandidate,
} from '@/modules/imports/visio/types'

const RUN = randomUUID().slice(0, 8)
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])

let reachable = false
try { await db.$queryRaw`SELECT 1`; reachable = true } catch { console.warn('library command tests skipped: local Postgres unreachable (port 5434)') }

const rect: StoredCandidate = {
  index: 0, name: `Standard Rectangle ${RUN}`, category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL,
  drawingWidthIn: 3.125, drawingHeightIn: 1.5, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#00ffff', stroke: '#000000',
  rings: [[{ x: 0, y: 0 }, { x: 3.125, y: 0 }, { x: 3.125, y: 1.5 }, { x: 0, y: 1.5 }]],
}
const alarm: StoredCandidate = { ...rect, index: 1, name: `Guard Alarm ${RUN}`, category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH, drawingWidthIn: 0.125, drawingHeightIn: 0.125,
  rings: [[{ x: 0, y: 0 }, { x: 0.125, y: 0 }, { x: 0.125, y: 0.125 }, { x: 0, y: 0.125 }]] }

describe.skipIf(!reachable)('stencil library commands', () => {
  let orgA = '', orgB = '', userId = ''
  const ctxA = () => ({ userId, orgId: orgA })
  const ctxB = () => ({ userId, orgId: orgB })

  beforeAll(async () => {
    initCommands()
    orgA = (await db.organization.create({ data: { name: `Library A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Library B ${RUN}` } })).id
    userId = (await db.user.create({ data: { email: `library-${RUN}@poolforge.test`, name: 'Owner' } })).id
    setStencilConverter(async () => ({ candidates: [rect, alarm], skipped: [{ index: 2, name: 'SOB Text', reason: 'TEXT_ONLY' }] }))
  })
  afterEach(async () => { await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } }) })
  afterAll(async () => {
    setStencilConverter(null)
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  async function preview(ctx = ctxA()): Promise<PreviewOutput> {
    const uploadRef = stageUpload({ bytes: OLE2, declaredMimeType: null, orgId: ctx.orgId })
    const r = await dispatchCommand(LibraryCommand.PREVIEW, { uploadRef, fileName: 'Pool.vss' }, ctx)
    if (!r.ok) throw new Error(r.error)
    return r.data as PreviewOutput
  }

  it('registers all five, none a stub, preview and commit silent to voice', () => {
    for (const id of Object.values(LibraryCommand)) {
      const cmd = get(id)
      expect(cmd, id).toBeDefined()
      expect(cmd?.unimplemented, id).toBeUndefined()
      expect(cmd?.category).toBe('template')
    }
    expect(get(LibraryCommand.PREVIEW)?.voiceExamples).toBeUndefined()
    expect(get(LibraryCommand.COMMIT)?.voiceExamples).toBeUndefined()
    expect(get(LibraryCommand.PLACE)?.runsOn).toBe('client')
  })

  it('preview stores a pending import and returns candidates without rings', async () => {
    const p = await preview()
    expect(p.candidates.map(c => c.name)).toEqual([rect.name, alarm.name])
    expect((p.candidates[0] as { rings?: unknown }).rings).toBeUndefined()
    expect(p.skipped[0]?.reason).toBe('TEXT_ONLY')
    expect(p.scaleInchesPerInch).toBe(VISIO_SCALE_DEFAULT)
    const row = await db.stencilImport.findUniqueOrThrow({ where: { id: p.importId } })
    expect(row.status).toBe('PENDING')
    expect(row.orgId).toBe(orgA)
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('preview refuses a ref staged under another org and bytes that are not a stencil', async () => {
    const foreign = stageUpload({ bytes: OLE2, declaredMimeType: null, orgId: orgB })
    expect((await dispatchCommand(LibraryCommand.PREVIEW, { uploadRef: foreign, fileName: 'Pool.vss' }, ctxA())).ok).toBe(false)
    const png = stageUpload({ bytes: Buffer.from('not a stencil'), declaredMimeType: null, orgId: orgA })
    const r = await dispatchCommand(LibraryCommand.PREVIEW, { uploadRef: png, fileName: 'x.vss' }, ctxA())
    expect((r as { error: string }).error).toBe(VisioMessage.NOT_A_STENCIL)
  })

  it('commit scales, writes org-scoped rows, and reports created', async () => {
    const p = await preview()
    const r = await dispatchCommand(LibraryCommand.COMMIT, {
      importId: p.importId, scaleInchesPerInch: VISIO_SCALE_DEFAULT,
      items: p.candidates.map(c => ({ index: c.index, include: true, name: c.name, category: c.category, shapeKind: c.shapeKind })),
    }, ctxA())
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
    const data = (r as { data: CommitOutput }).data
    expect(data.created).toBe(2)
    expect(data.replaced).toBe(0)
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: rect.name } } })
    expect(row.widthIn).toBeCloseTo(300, 6)
    expect(row.heightIn).toBeCloseTo(144, 6)
    expect(row.rings).toEqual([[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 144 }, { x: 0, y: 144 }]])
    expect(row.source).toBe('VISIO_IMPORT')
    expect(row.sourceFile).toBe('Pool.vss')
    expect(row.sourceMaster).toBe(rect.name)
    expect((await db.stencilImport.findUniqueOrThrow({ where: { id: p.importId } })).status).toBe('COMMITTED')
    const audit = await db.commandAuditLog.findFirst({ where: { orgId: orgA, commandId: LibraryCommand.COMMIT } })
    expect(audit?.userId).toBe(userId)
  })

  it('a second import of the same name replaces, and commit twice is refused', async () => {
    const p = await preview()
    const items = [{ index: 0, include: true, name: rect.name, category: rect.category, shapeKind: rect.shapeKind }]
    const first = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 48, items }, ctxA())
    expect(first.ok).toBe(true)
    expect((first as { data: CommitOutput }).data.replaced).toBe(1)
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: rect.name } } })
    expect(row.widthIn).toBeCloseTo(150, 6) // the new scale won
    const again = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 48, items }, ctxA())
    expect(again.ok).toBe(false)
    expect((again as { error: string }).error).toBe(VisioMessage.ALREADY_COMMITTED)
  })

  it('commit refuses two included items with one name, nothing written', async () => {
    const p = await preview()
    const before = await db.orgStencil.count({ where: { orgId: orgA } })
    const r = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [
      { index: 0, include: true, name: `Twin ${RUN}`, category: rect.category, shapeKind: rect.shapeKind },
      { index: 1, include: true, name: `Twin ${RUN}`, category: alarm.category, shapeKind: alarm.shapeKind },
    ] }, ctxA())
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain(`Twin ${RUN}`)
    expect(await db.orgStencil.count({ where: { orgId: orgA } })).toBe(before)
  })

  it("commit refuses nothing selected, an unknown index and another org's import", async () => {
    const p = await preview()
    const none = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [{ index: 0, include: false, name: 'x', category: rect.category, shapeKind: rect.shapeKind }] }, ctxA())
    expect((none as { error: string }).error).toBe(VisioMessage.NOTHING_SELECTED)
    const bad = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [{ index: 99, include: true, name: 'x', category: rect.category, shapeKind: rect.shapeKind }] }, ctxA())
    expect(bad.ok).toBe(false)
    const other = await dispatchCommand(LibraryCommand.COMMIT, { importId: p.importId, scaleInchesPerInch: 96, items: [{ index: 0, include: true, name: 'x', category: rect.category, shapeKind: rect.shapeKind }] }, ctxB())
    expect((other as { error: string }).error).toBe(VisioMessage.EXPIRED)
  })

  it('list is per org and carries no rings', async () => {
    const a = await dispatchCommand(LibraryCommand.LIST, {}, ctxA())
    const b = await dispatchCommand(LibraryCommand.LIST, {}, ctxB())
    expect((a as { data: ListOutput }).data.stencils.map(s => s.name)).toContain(rect.name)
    expect((b as { data: ListOutput }).data.stencils).toEqual([])
    expect((a as { data: ListOutput }).data.stencils[0]).not.toHaveProperty('rings')
  })

  it('place returns the geometry for the client and refuses other orgs', async () => {
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: rect.name } } })
    const r = await dispatchCommand(LibraryCommand.PLACE, { orgStencilId: row.id, x: 120, y: 240 }, ctxA())
    expect(r.ok).toBe(true)
    const d = (r as { data: PlaceOutput }).data
    expect(d.shapeKind).toBe(ShapeKind.POLYGON_POOL)
    expect(d.points).toHaveLength(4)
    expect(d.width).toBeCloseTo(150, 6)
    expect(d.shapeId).toBe('client-pending')
    const other = await dispatchCommand(LibraryCommand.PLACE, { orgStencilId: row.id, x: 0, y: 0 }, ctxB())
    expect((other as { error: string }).error).toBe(VisioMessage.NOT_FOUND)
  })

  it("delete removes only the caller's row", async () => {
    const row = await db.orgStencil.findUniqueOrThrow({ where: { orgId_name: { orgId: orgA, name: alarm.name } } })
    const other = await dispatchCommand(LibraryCommand.DELETE, { orgStencilId: row.id }, ctxB())
    expect((other as { error: string }).error).toBe(VisioMessage.NOT_FOUND)
    const mine = await dispatchCommand(LibraryCommand.DELETE, { orgStencilId: row.id }, ctxA())
    expect(mine.ok).toBe(true)
    expect(await db.orgStencil.findUnique({ where: { id: row.id } })).toBeNull()
  })
})
