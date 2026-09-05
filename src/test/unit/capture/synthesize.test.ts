// The synthetic walk produces a payload the real decoder accepts, and the
// capture.synthesize command runs it end to end. Integration against the real
// local Postgres (`pnpm db:up`), because it writes a Drawing and a SiteCapture.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { decodeCapture } from '@/modules/capture/decode'
import { synthesizeCapture } from '@/modules/capture/synthesize'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('capture synthesize tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

describe('synthesizeCapture', () => {
  it('produces a payload the real decoder accepts', () => {
    // No mock, no shortcut: the boundary that guards every real capture must
    // accept the fabricated one, or the simulation is testing a different path.
    const payload = synthesizeCapture({ seed: 1, gapFraction: 0.1 })
    const field = decodeCapture(payload)
    expect(field.cols * field.rows).toBe(payload.frame.cols * payload.frame.rows)
    expect(field.captureId).toMatch(/^cap_[0-9a-f]{32}$/)
  })

  it('is deterministic under a seed', () => {
    const a = synthesizeCapture({ seed: 42, gapFraction: 0.2 })
    const b = synthesizeCapture({ seed: 42, gapFraction: 0.2 })
    // The captureId is random per call; the terrain is seeded.
    expect(a.elevations).toEqual(b.elevations)
    expect(a.coverage).toEqual(b.coverage)
  })

  it('leaves an unwalked patch, so coverage is below full', () => {
    const payload = synthesizeCapture({ seed: 3, gapFraction: 0.15 })
    const cov = payload.coverage as number[]
    expect(cov.some(c => c === 0)).toBe(true)
    expect(cov.some(c => c > 0)).toBe(true)
  })
})

async function run<T>(id: string, input: unknown, ctx: CommandContext): Promise<CommandResult<T>> {
  const command = get(id)
  if (!command) throw new Error(`${id} is not registered`)
  const parsed = command.inputSchema.parse(input)
  const result = await command.execute(parsed, ctx)
  if (result.ok) command.outputSchema.parse(result.data)
  return result as CommandResult<T>
}

describe.skipIf(!reachable)('capture.synthesize', () => {
  let orgId = ''
  let userId = ''
  let projectId = ''
  let ctx: CommandContext

  beforeAll(async () => {
    initCommands()
    orgId = (await db.organization.create({ data: { name: `Synth ${RUN}` } })).id
    userId = (await db.user.create({ data: { email: `synth-${RUN}@example.test`, passwordHash: 'x' } })).id
    projectId = (await db.project.create({ data: { orgId, name: 'Synth project' } })).id
    ctx = { userId, orgId }
  })

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: orgId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  it('ingests a simulated walk into a real SiteCapture and grade', async () => {
    const result = await run<{ captureId: string; measuredCells: number; cells: number }>(
      'capture.synthesize',
      { projectId, gapFraction: 0.15 },
      ctx,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // A row landed, keyed to this org and project.
    const row = await db.siteCapture.findFirst({
      where: { orgId, projectId, captureId: result.data.captureId },
      select: { measuredCells: true, cols: true, rows: true },
    })
    expect(row).not.toBeNull()
    expect(row?.measuredCells).toBe(result.data.measuredCells)
    // The gap means not every cell was measured.
    expect(result.data.measuredCells).toBeLessThan(result.data.cells)
    expect(result.data.measuredCells).toBeGreaterThan(0)

    // And the drawing now carries an existing-ground surface from the walk.
    const drawing = await db.drawing.findUnique({
      where: { projectId },
      select: { rootJson: true },
    })
    const grade = (drawing?.rootJson as { grade?: { existing?: { enabled?: boolean } } } | null)?.grade
    expect(grade?.existing?.enabled).toBe(true)
  })

  it('is org-scoped: another org cannot synthesize onto this project', async () => {
    const otherOrg = (await db.organization.create({ data: { name: `Synth other ${RUN}` } })).id
    const result = await run('capture.synthesize', { projectId }, { userId, orgId: otherOrg })
    expect(result.ok).toBe(false)
    await db.organization.deleteMany({ where: { id: otherOrg } })
  })
})
