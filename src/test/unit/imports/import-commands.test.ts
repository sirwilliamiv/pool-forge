// Integration test: these hit the real local Postgres (`pnpm db:up`). Prisma is
// never mocked here, per repo convention: mocks have hidden migration drift in
// past projects, and these commands exist to exercise the new tables.
//
// Every unique-indexed value interpolates the run-scoped org id so parallel
// runs and incomplete teardown cannot collide.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'
import { emptyDesignIntent, type DesignIntent } from '@/modules/imports/intent'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn(
    'import command integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.',
  )
}

async function run<T>(id: string, input: unknown, ctx: CommandContext): Promise<CommandResult<T>> {
  const cmd = get(id)
  if (!cmd) throw new Error(`command not registered: ${id}`)
  const parsed = cmd.inputSchema.parse(input)
  const result = await cmd.execute(parsed, ctx)
  if (result.ok) cmd.outputSchema.parse(result.data)
  return result as CommandResult<T>
}

interface SessionData {
  sessionId: string
  status: string
  intent: DesignIntent
  touchedPaths?: string[]
}

describe.skipIf(!reachable)('import commands', () => {
  let orgA = ''
  let orgB = ''
  let userId = ''
  let projectA = ''
  let projectB = ''
  let ctxA: CommandContext
  let ctxB: CommandContext

  beforeAll(async () => {
    initCommands()

    const a = await db.organization.create({ data: { name: `Import Test A ${RUN}` } })
    const b = await db.organization.create({ data: { name: `Import Test B ${RUN}` } })
    orgA = a.id
    orgB = b.id

    const user = await db.user.create({
      data: { email: `import-${RUN}-${orgA}@example.test`, passwordHash: 'x' },
    })
    userId = user.id

    projectA = (await db.project.create({ data: { orgId: orgA, name: `A ${RUN}` } })).id
    projectB = (await db.project.create({ data: { orgId: orgB, name: `B ${RUN}` } })).id

    ctxA = { userId, orgId: orgA }
    ctxB = { userId, orgId: orgB }
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  it('registers all seven import commands under the import category', () => {
    const ids = [
      'import.session.create',
      'import.image.upload',
      'import.image.analyze',
      'import.calibrate.set',
      'import.intent.patch',
      'import.intent.apply',
      'import.session.discard',
    ]
    for (const id of ids) {
      const cmd = get(id)
      expect(cmd, `${id} is missing`).toBeDefined()
      expect(cmd?.category).toBe('import')
      expect(cmd?.inputSchema).toBeDefined()
      expect(cmd?.outputSchema).toBeDefined()
    }
  })

  it('the tracks that have not landed fail loudly rather than returning ok', async () => {
    const stubs = ['import.image.upload', 'import.image.analyze']
    for (const id of stubs) {
      const cmd = get(id)
      const result = await cmd!.execute({} as never, ctxA)
      expect(result.ok, `${id} must not report success`).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/^not implemented: track/)
    }
  })

  it('apply refuses while scale is uncalibrated', async () => {
    const created = await run<SessionData>('import.session.create', { projectId: projectA }, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await run('import.intent.apply', {
      sessionId: created.data.sessionId,
      projectId: projectA,
    }, ctxA)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not calibrated/i)
  })

  it('apply refuses while a low-confidence field is untouched, then names it', async () => {
    const created = await run<SessionData>('import.session.create', { projectId: projectA }, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const intent = emptyDesignIntent()
    intent.scale = { pixelsPerInch: 4, method: 'grid', confidence: 0.95 }
    intent.pool = { ...intent.pool, shapeFamily: 'rectangle', lengthFt: 32, widthFt: 16 }
    intent.fieldConfidence = { 'pool.widthFt': 0.2 }
    await db.importSession.update({
      where: { id: created.data.sessionId },
      data: { designIntentJson: intent as unknown as object },
    })

    const blocked = await run('import.intent.apply', {
      sessionId: created.data.sessionId,
      projectId: projectA,
    }, ctxA)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toContain('pool.widthFt')
  })

  it('apply refuses a session belonging to another org', async () => {
    const created = await run<SessionData>('import.session.create', { projectId: projectA }, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await run('import.intent.apply', {
      sessionId: created.data.sessionId,
      projectId: projectA,
    }, ctxB)
    expect(result.ok).toBe(false)
  })

  it('session.create opens a DRAFT session with an empty intent', async () => {
    const result = await run<SessionData>('import.session.create', { projectId: projectA }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.status).toBe('DRAFT')
    expect(result.data.intent).toEqual(emptyDesignIntent())

    const row = await db.importSession.findFirst({
      where: { id: result.data.sessionId, orgId: orgA },
    })
    expect(row).not.toBeNull()
    expect(row?.projectId).toBe(projectA)
  })

  it('session.create refuses a project belonging to another org', async () => {
    const result = await run('import.session.create', { projectId: projectB }, ctxA)
    expect(result).toEqual({ ok: false, error: 'Project not found' })
  })

  it('session.create refuses source images belonging to another org', async () => {
    const foreign = await db.sourceImage.create({
      data: {
        orgId: orgB,
        storageKey: `ab/cd/${'0'.repeat(64)}`,
        mimeType: 'image/png',
        bytes: 10,
        sha256: '0'.repeat(64),
        widthPx: 10,
        heightPx: 10,
      },
    })
    const result = await run('import.session.create', { sourceImageIds: [foreign.id] }, ctxA)
    expect(result.ok).toBe(false)
  })

  it('session.create accepts source images from its own org', async () => {
    const sha = `1${'0'.repeat(63)}`
    const mine = await db.sourceImage.create({
      data: {
        orgId: orgA,
        storageKey: `10/00/${sha}`,
        mimeType: 'image/png',
        bytes: 10,
        sha256: sha,
        widthPx: 10,
        heightPx: 10,
      },
    })
    const result = await run<SessionData>('import.session.create', { sourceImageIds: [mine.id] }, ctxA)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.intent.sourceImageIds).toEqual([mine.id])
  })

  it('calibrate.set records the manual scale and persists it', async () => {
    const created = await run<SessionData>('import.session.create', {}, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await run<SessionData>(
      'import.calibrate.set',
      { sessionId: created.data.sessionId, pixelsPerInch: 4.5, method: 'manual', confidence: 1 },
      ctxA,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.intent.scale).toEqual({
      pixelsPerInch: 4.5,
      method: 'manual',
      confidence: 1,
    })

    const reread = await run<SessionData>(
      'import.intent.patch',
      { sessionId: created.data.sessionId, patch: {} },
      ctxA,
    )
    expect(reread.ok).toBe(true)
    if (reread.ok) expect(reread.data.intent.scale.pixelsPerInch).toBe(4.5)
  })

  it('intent.patch merges a human correction and reports the touched paths', async () => {
    const created = await run<SessionData>('import.session.create', {}, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await run<SessionData>(
      'import.intent.patch',
      {
        sessionId: created.data.sessionId,
        patch: { pool: { lengthFt: 32, shapeFamily: 'kidney' } },
      },
      ctxA,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.intent.pool.lengthFt).toBe(32)
    expect(result.data.intent.pool.shapeFamily).toBe('kidney')
    expect(result.data.touchedPaths).toEqual(['pool.lengthFt', 'pool.shapeFamily'])
  })

  it('every session command is org scoped', async () => {
    const created = await run<SessionData>('import.session.create', {}, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.data.sessionId

    expect(await run('import.calibrate.set', { sessionId: id, pixelsPerInch: 2 }, ctxB)).toEqual({
      ok: false,
      error: 'Import session not found',
    })
    expect(await run('import.intent.patch', { sessionId: id, patch: {} }, ctxB)).toEqual({
      ok: false,
      error: 'Import session not found',
    })
    expect(await run('import.session.discard', { sessionId: id }, ctxB)).toEqual({
      ok: false,
      error: 'Import session not found',
    })
  })

  it('session.discard marks the session DISCARDED', async () => {
    const created = await run<SessionData>('import.session.create', {}, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await run<{ status: string }>(
      'import.session.discard',
      { sessionId: created.data.sessionId },
      ctxA,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.status).toBe('DISCARDED')

    const row = await db.importSession.findFirst({
      where: { id: created.data.sessionId, orgId: orgA },
      select: { status: true },
    })
    expect(row?.status).toBe('DISCARDED')
  })

  it('an applied session cannot be discarded', async () => {
    const created = await run<SessionData>('import.session.create', {}, ctxA)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    await db.importSession.update({
      where: { id: created.data.sessionId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    })
    const result = await run('import.session.discard', { sessionId: created.data.sessionId }, ctxA)
    expect(result).toEqual({ ok: false, error: 'An applied import cannot be discarded' })
  })

  it('an unauthenticated context is refused before any query runs', async () => {
    const anon: CommandContext = { userId: 'anonymous', orgId: 'anonymous' }
    expect(await run('import.session.create', {}, anon)).toEqual({
      ok: false,
      error: 'Not authenticated',
    })
    expect(await run('import.intent.patch', { sessionId: 'x', patch: {} }, anon)).toEqual({
      ok: false,
      error: 'Not authenticated',
    })
    expect(await run('import.session.discard', { sessionId: 'x' }, anon)).toEqual({
      ok: false,
      error: 'Not authenticated',
    })
  })

  it('ImageAnalysis is idempotent on (sourceImageId, stage, extractorVersion)', async () => {
    const sha = `2${'0'.repeat(63)}`
    const image = await db.sourceImage.create({
      data: {
        orgId: orgA,
        storageKey: `20/00/${sha}`,
        mimeType: 'image/png',
        bytes: 10,
        sha256: sha,
        widthPx: 10,
        heightPx: 10,
      },
    })
    await db.imageAnalysis.create({
      data: {
        sourceImageId: image.id,
        stage: 'CLASSIFY',
        extractorVersion: 'v1',
        model: 'test',
        promptHash: 'abc',
      },
    })
    await expect(
      db.imageAnalysis.create({
        data: {
          sourceImageId: image.id,
          stage: 'CLASSIFY',
          extractorVersion: 'v1',
          model: 'test',
          promptHash: 'abc',
        },
      }),
    ).rejects.toThrow()
  })
})
