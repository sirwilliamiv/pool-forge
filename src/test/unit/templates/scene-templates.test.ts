// Scene templates: save a drawing once, start later projects from it.
//
// Hits the real local DB per repo convention, with run-scoped ids so parallel
// runs and incomplete teardown cannot collide.

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'

initCommands()

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('scene template tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

let orgA = ''
let orgB = ''
let projectA = ''
let projectB = ''
let userA = ''
let userB = ''
let ctxA: CommandContext
let ctxB: CommandContext

async function run<T>(id: string, input: unknown, ctx: CommandContext): Promise<CommandResult<T>> {
  const cmd = get(id)
  if (!cmd) throw new Error(`command not registered: ${id}`)
  return (await cmd.execute(input as never, ctx)) as CommandResult<T>
}

/** A drawing with `count` trivial shapes on it. */
async function seedDrawing(projectId: string, count: number): Promise<void> {
  const shapes = Array.from({ length: count }, (_, i) => ({
    id: `seed-${i}`,
    kind: 'STENCIL',
    stencilId: 'site.tree',
    x: i * 120,
    y: 0,
    width: 96,
    height: 96,
    rotation: 0,
    zIndex: i + 1,
    locked: false,
    hidden: false,
  }))
  await db.drawing.upsert({
    where: { projectId },
    create: { projectId, scale: 1, rootJson: { shapes } },
    update: { rootJson: { shapes } },
  })
}

beforeAll(async () => {
  if (!reachable) return
  const a = await db.organization.create({ data: { name: `Scene A ${RUN}` }, select: { id: true } })
  const b = await db.organization.create({ data: { name: `Scene B ${RUN}` }, select: { id: true } })
  orgA = a.id
  orgB = b.id
  const pa = await db.project.create({ data: { orgId: orgA, name: `A ${RUN}` }, select: { id: true } })
  const pb = await db.project.create({ data: { orgId: orgB, name: `B ${RUN}` }, select: { id: true } })
  projectA = pa.id
  projectB = pb.id
  // Real users: `createdBy` is a foreign key, so a fabricated id fails the
  // constraint rather than exercising the command.
  const ua = await db.user.create({
    data: { email: `scene-a-${RUN}@example.test`, passwordHash: 'x' },
    select: { id: true },
  })
  const ub = await db.user.create({
    data: { email: `scene-b-${RUN}@example.test`, passwordHash: 'x' },
    select: { id: true },
  })
  userA = ua.id
  userB = ub.id
  ctxA = { userId: userA, orgId: orgA }
  ctxB = { userId: userB, orgId: orgB }
})

afterAll(async () => {
  if (!reachable) return
  await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  await db.user.deleteMany({ where: { id: { in: [userA, userB] } } })
})

describe.skipIf(!reachable)('scene templates', () => {
  it('refuses to save an empty sheet', async () => {
    await db.drawing.deleteMany({ where: { projectId: projectA } })
    const result = await run('template.scene.save', { projectId: projectA, name: `Empty ${RUN}` }, ctxA)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/nothing on this sheet/i)
  })

  it('saves a drawing and reports what it captured', async () => {
    await seedDrawing(projectA, 4)
    const result = await run<{ templateId: string; objectCount: number }>(
      'template.scene.save',
      { projectId: projectA, name: `Backyard ${RUN}`, description: 'Standard start' },
      ctxA,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.objectCount).toBe(4)
  })

  it('refuses a duplicate name unless overwrite is asked for', async () => {
    const dupe = await run('template.scene.save', { projectId: projectA, name: `Backyard ${RUN}` }, ctxA)
    expect(dupe.ok).toBe(false)
    if (!dupe.ok) expect(dupe.error).toMatch(/already exists/i)

    const forced = await run('template.scene.save', {
      projectId: projectA,
      name: `Backyard ${RUN}`,
      overwrite: true,
    }, ctxA)
    expect(forced.ok).toBe(true)
  })

  it('merges a template alongside what is already drawn', async () => {
    const list = await run<{ templates: { id: string }[] }>('template.scene.list', {}, ctxA)
    expect(list.ok).toBe(true)
    if (!list.ok) return
    const templateId = list.data.templates[0]?.id
    expect(templateId).toBeTruthy()
    if (!templateId) return

    await seedDrawing(projectA, 2)
    const applied = await run<{ added: number; total: number }>('template.scene.apply', {
      projectId: projectA,
      templateId,
      mode: 'merge',
    }, ctxA)
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.data.added).toBe(4)
    expect(applied.data.total).toBe(6)
  })

  it('will not replace a drawing without an explicit confirmation', async () => {
    const list = await run<{ templates: { id: string }[] }>('template.scene.list', {}, ctxA)
    if (!list.ok) return
    const templateId = list.data.templates[0]!.id

    await seedDrawing(projectA, 3)
    const blocked = await run('template.scene.apply', {
      projectId: projectA,
      templateId,
      mode: 'replace',
    }, ctxA)
    expect(blocked.ok, 'replacing must not happen silently').toBe(false)
    if (!blocked.ok) expect(blocked.error).toContain('3 objects')

    const confirmed = await run<{ replaced: number; total: number }>('template.scene.apply', {
      projectId: projectA,
      templateId,
      mode: 'replace',
      confirmReplace: true,
    }, ctxA)
    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) return
    expect(confirmed.data.replaced).toBe(3)
    expect(confirmed.data.total).toBe(4)
  })

  it('gives applied shapes fresh ids, so applying twice does not collide', async () => {
    const list = await run<{ templates: { id: string }[] }>('template.scene.list', {}, ctxA)
    if (!list.ok) return
    const templateId = list.data.templates[0]!.id

    await seedDrawing(projectA, 0)
    await run('template.scene.apply', { projectId: projectA, templateId, mode: 'merge' }, ctxA)
    await run('template.scene.apply', { projectId: projectA, templateId, mode: 'merge' }, ctxA)

    const drawing = await db.drawing.findUnique({ where: { projectId: projectA } })
    const shapes = ((drawing?.rootJson as { shapes?: { id: string }[] })?.shapes ?? [])
    expect(shapes.length).toBe(8)
    expect(new Set(shapes.map(s => s.id)).size, 'every id must be unique').toBe(8)
  })

  it('keeps at most one default', async () => {
    await seedDrawing(projectA, 2)
    await run('template.scene.save', { projectId: projectA, name: `Second ${RUN}` }, ctxA)
    const list = await run<{ templates: { id: string }[] }>('template.scene.list', {}, ctxA)
    if (!list.ok) return
    const [first, second] = list.data.templates

    await run('template.scene.setDefault', { templateId: first!.id }, ctxA)
    await run('template.scene.setDefault', { templateId: second!.id }, ctxA)

    const defaults = await db.sceneTemplate.count({ where: { orgId: orgA, isDefault: true } })
    expect(defaults).toBe(1)
  })

  it('clears the default when passed null', async () => {
    await run('template.scene.setDefault', { templateId: null }, ctxA)
    expect(await db.sceneTemplate.count({ where: { orgId: orgA, isDefault: true } })).toBe(0)
  })

  it('never exposes another org template', async () => {
    const list = await run<{ templates: unknown[] }>('template.scene.list', {}, ctxB)
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.data.templates).toHaveLength(0)

    const mine = await run<{ templates: { id: string }[] }>('template.scene.list', {}, ctxA)
    if (!mine.ok) return
    const stolen = await run('template.scene.apply', {
      projectId: projectB,
      templateId: mine.data.templates[0]!.id,
      mode: 'merge',
    }, ctxB)
    expect(stolen.ok, 'a template must never cross an org boundary').toBe(false)
  })

  it('refuses to delete another org template', async () => {
    const mine = await run<{ templates: { id: string }[] }>('template.scene.list', {}, ctxA)
    if (!mine.ok) return
    const result = await run('template.scene.delete', { templateId: mine.data.templates[0]!.id }, ctxB)
    expect(result.ok).toBe(false)
    expect(await db.sceneTemplate.count({ where: { orgId: orgA } })).toBeGreaterThan(0)
  })
})
