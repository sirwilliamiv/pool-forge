// Integration: these hit the real local Postgres (`pnpm db:up`). Prisma is
// never mocked, per repo convention, because the defect this file exists to
// catch is a command that reports success and writes nothing.
//
// Every unique-indexed value interpolates the run-scoped org id, so parallel
// runs and incomplete teardown cannot collide.

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { decodeCaptureRejection, statusForCaptureRejection } from '@/modules/capture/contract'
import { stageCapture } from '@/modules/capture/staging'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import type { CommandContext } from '@/modules/commands/registry'
import { parseDrawingPayload } from '@/modules/editor/drawing-payload'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { captureId, fullyWalked, hole, skippedStripe, slope, smallYard, swale } from '@/test/fixtures/yards'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('capture integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

interface IngestData {
  captureId: string
  cells: number
  measuredCells: number
  shotCount: number
  keptFixed: number
  replacedPoints: number
  maxErrorFt: number
  datumFt: number
  coverage: { measuredPct: number; gapAreaSqft: number; complete: boolean; caveat: string | null }
}

interface CoverageData {
  captureId: string | null
  region: string
  coverage: { measuredPct: number; complete: boolean; caveat: string | null } | null
  note: string | null
}

describe.skipIf(!reachable)('site capture commands', () => {
  let orgA = ''
  let orgB = ''
  let userId = ''
  let projectA = ''
  let projectB = ''
  let ctxA: CommandContext
  let ctxB: CommandContext

  beforeAll(async () => {
    initCommands()
    const a = await db.organization.create({ data: { name: `Capture A ${RUN}` } })
    const b = await db.organization.create({ data: { name: `Capture B ${RUN}` } })
    orgA = a.id
    orgB = b.id

    const user = await db.user.create({
      data: { email: `capture-${RUN}-${orgA}@example.test`, passwordHash: 'x' },
    })
    userId = user.id
    await db.organizationMember.create({ data: { userId, orgId: orgA } })
    await db.organizationMember.create({ data: { userId, orgId: orgB } })

    projectA = (await db.project.create({ data: { orgId: orgA, name: `Capture A ${RUN}` } })).id
    projectB = (await db.project.create({ data: { orgId: orgB, name: `Capture B ${RUN}` } })).id

    ctxA = { userId, orgId: orgA }
    ctxB = { userId, orgId: orgB }
  })

  afterAll(async () => {
    if (!reachable) return
    await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  /** Stage a yard and run the ingest exactly the way the route does. */
  async function ingest(
    payload: unknown,
    ctx: CommandContext,
    projectId: string,
    extra: Record<string, unknown> = {},
  ) {
    const captureRef = stageCapture({ payload, orgId: ctx.orgId })
    return dispatchCommand<IngestData>(
      'capture.heightfield.ingest',
      { captureRef, projectId, ...extra },
      ctx,
    )
  }

  it('turns a walked yard into the existing ground and writes the mask', async () => {
    const id = captureId(101)
    const result = await ingest(
      smallYard({ captureId: id, terrain: slope(), coverage: fullyWalked, siteElevationFt: 12 }),
      ctxA,
      projectA,
    )

    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok) return

    expect(result.data.captureId).toBe(id)
    expect(result.data.cells).toBe(40 * 30)
    expect(result.data.measuredCells).toBe(40 * 30)
    expect(result.data.shotCount).toBeGreaterThan(2)
    expect(result.data.datumFt).toBe(12)
    expect(result.data.coverage.complete).toBe(true)
    expect(result.data.coverage.caveat).toBeNull()

    const row = await db.siteCapture.findFirst({ where: { orgId: orgA, captureId: id } })
    expect(row).toBeTruthy()
    expect(row?.projectId).toBe(projectA)
    expect(row?.cols).toBe(40)
    expect(row?.rows).toBe(30)
    expect(row?.createdBy).toBe(userId)
    // The mask is the point of the whole feature: bytes for every cell.
    expect(row?.coverage.byteLength).toBe(40 * 30)
    expect(row?.elevationsFt.byteLength).toBe(40 * 30 * 4)

    const drawing = await db.drawing.findUnique({ where: { projectId: projectA } })
    const grade = parseDrawingPayload(drawing?.rootJson).grade
    expect(grade?.existing.enabled).toBe(true)
    expect(grade?.existing.baseElevationFt).toBe(12)
    expect(grade?.existing.points.length).toBe(result.data.shotCount)
    expect(grade?.existing.capture?.captureId).toBe(id)
    expect(grade?.existing.capture?.measuredFraction).toBe(1)
    // The design intent is not what the phone saw and must not move.
    expect(grade?.finished.points).toEqual([])
  })

  it('writes exactly one audit row, whatever the outcome', async () => {
    const before = await db.commandAuditLog.count({
      where: { orgId: orgA, commandId: 'capture.heightfield.ingest' },
    })

    await ingest(smallYard({ captureId: captureId(102) }), ctxA, projectA)
    await ingest({ nonsense: true }, ctxA, projectA)

    const after = await db.commandAuditLog.count({
      where: { orgId: orgA, commandId: 'capture.heightfield.ingest' },
    })
    expect(after - before).toBe(2)

    const failure = await db.commandAuditLog.findFirst({
      where: { orgId: orgA, commandId: 'capture.heightfield.ingest', success: false },
      orderBy: { ranAt: 'desc' },
    })
    expect(failure).toBeTruthy()
    // The audit row records the staged reference, never a megabyte of heights.
    expect(JSON.stringify(failure?.inputJson).length).toBeLessThan(400)
  })

  it('says what is interpolated when a stripe was skipped', async () => {
    const result = await ingest(
      smallYard({ captureId: captureId(103), terrain: swale(), coverage: skippedStripe(12, 18) }),
      ctxA,
      projectA,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.coverage.complete).toBe(false)
    expect(result.data.coverage.measuredPct).toBeLessThan(100)
    expect(result.data.coverage.gapAreaSqft).toBeGreaterThan(0)
    expect(result.data.coverage.caveat).toMatch(/never walked/)
    expect(result.data.coverage.caveat).toMatch(/interpolated/)
  })

  it('re-uploading the same walk updates one row rather than surveying twice', async () => {
    const id = captureId(104)
    const first = await ingest(smallYard({ captureId: id }), ctxA, projectA)
    const second = await ingest(smallYard({ captureId: id }), ctxA, projectA)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)

    const rows = await db.siteCapture.count({ where: { orgId: orgA, captureId: id } })
    expect(rows).toBe(1)
  })

  it('refuses another organisation\'s staged capture', async () => {
    // The ref is opaque and single use, but a leaked one must still be useless
    // outside the org it was raised in.
    const captureRef = stageCapture({ payload: smallYard({ captureId: captureId(105) }), orgId: orgA })
    const result = await dispatchCommand('capture.heightfield.ingest', { captureRef, projectId: projectB }, ctxB)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/no longer available/)
  })

  it('refuses a project that belongs to another organisation', async () => {
    const result = await ingest(smallYard({ captureId: captureId(106) }), ctxB, projectA)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Project not found')
  })

  it('turns a hostile payload into a sentence and a status, never a parser message', async () => {
    const result = await ingest({ contractVersion: 1, frame: { cols: 'lots' } }, ctxA, projectA)
    expect(result.ok).toBe(false)
    if (result.ok) return

    const rejection = decodeCaptureRejection(result.error)
    expect(rejection).toBeTruthy()
    expect(statusForCaptureRejection(rejection!.code)).toBe(400)
    expect(rejection!.message).toMatch(/Nothing was changed/)
    // Nothing a Zod issue list would contain.
    expect(rejection!.message).not.toMatch(/Expected|Required|Invalid literal/)
  })

  it('tells a newer phone to expect an older server, in words', async () => {
    const result = await ingest({ ...smallYard({}), contractVersion: 99 }, ctxA, projectA)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const rejection = decodeCaptureRejection(result.error)
    expect(rejection?.code).toBe('UNSUPPORTED_VERSION')
    expect(statusForCaptureRejection('UNSUPPORTED_VERSION')).toBe(409)
  })

  it('reports coverage over the pool footprint, not just the whole walk', async () => {
    const project = (await db.project.create({ data: { orgId: orgA, name: `Pool ${RUN}` } })).id

    // A pool drawn over the part of the yard nobody walked. Positioned in cell
    // terms rather than in round inches: the capture lands with its benchmark
    // at the drawing origin, and the benchmark is the middle of the yard's near
    // edge, so cell (col, row) sits at ((col - 20) * cell, row * cell).
    const CELL_IN = 0.25 * 39.3700787401575
    const at = (col: number, row: number) => ({ x: (col - 20) * CELL_IN, y: row * CELL_IN })
    const corner = at(9, 7)
    const pool: Shape = {
      id: 'pool-1',
      kind: ShapeKind.RECTANGLE_POOL,
      x: corner.x,
      y: corner.y,
      width: 9 * CELL_IN,
      height: 9 * CELL_IN,
      rotation: 0,
      locked: false,
      hidden: false,
      depthShallow: 3,
      depthDeep: 8,
    } as Shape

    await db.drawing.create({
      data: {
        projectId: project,
        scale: 1,
        rootJson: { shapes: [pool], survey: null } as unknown as object,
      },
    })

    await ingest(
      smallYard({ captureId: captureId(107), coverage: hole(8, 20, 6, 18) }),
      ctxA,
      project,
    )

    const inPool = await dispatchCommand<CoverageData>(
      'capture.coverage.describe',
      { projectId: project, region: 'pool' },
      ctxA,
    )
    expect(inPool.ok).toBe(true)
    if (!inPool.ok) return
    expect(inPool.data.region).toBe('pool')
    // The hole is exactly where the pool is, so the footprint is far worse off
    // than the yard as a whole. Reporting only the whole-capture figure is how
    // a survey with a hole in the dig looks fine.
    expect(inPool.data.coverage?.measuredPct).toBe(0)
    expect(inPool.data.coverage?.caveat).toMatch(/pool footprint/)

    const whole = await dispatchCommand<CoverageData>(
      'capture.coverage.describe',
      { projectId: project, region: 'capture' },
      ctxA,
    )
    expect(whole.ok).toBe(true)
    if (!whole.ok) return
    expect(whole.data.coverage?.measuredPct).toBeGreaterThan(50)
  })

  it('says nobody has walked it rather than reporting nothing', async () => {
    const project = (await db.project.create({ data: { orgId: orgA, name: `Unwalked ${RUN}` } })).id
    const result = await dispatchCommand<CoverageData>(
      'capture.coverage.describe',
      { projectId: project },
      ctxA,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.coverage).toBeNull()
    expect(result.data.note).toMatch(/Nobody has walked this site/)
  })

  it('never reads another organisation\'s capture', async () => {
    const result = await dispatchCommand<CoverageData>(
      'capture.coverage.describe',
      { projectId: projectA },
      ctxB,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Project not found')
  })

  it('keeps a fixed constraint and supersedes a typed guess', async () => {
    const project = (await db.project.create({ data: { orgId: orgA, name: `Merge ${RUN}` } })).id
    await db.drawing.create({
      data: {
        projectId: project,
        scale: 1,
        rootJson: {
          shapes: [],
          survey: null,
          grade: {
            existing: {
              baseElevationFt: 0,
              falloff: 2,
              enabled: true,
              points: [
                { id: 'sill', x: 0, y: 0, elevationFt: 1.5, kind: 'fixed', label: 'door sill' },
                { id: 'guess', x: 120, y: 120, elevationFt: -9, kind: 'existing' },
              ],
            },
            finished: { baseElevationFt: 0, falloff: 2, enabled: true, points: [] },
          },
        },
      },
    })

    const result = await ingest(smallYard({ captureId: captureId(108) }), ctxA, project)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.keptFixed).toBe(1)
    expect(result.data.replacedPoints).toBe(1)

    const drawing = await db.drawing.findUnique({ where: { projectId: project } })
    const points = parseDrawingPayload(drawing?.rootJson).grade?.existing.points ?? []
    expect(points.some(p => p.id === 'sill')).toBe(true)
    expect(points.some(p => p.id === 'guess')).toBe(false)
  })
})
