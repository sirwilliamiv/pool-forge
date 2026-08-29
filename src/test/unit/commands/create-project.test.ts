// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is never
// mocked here, per repo convention.
//
// `create.project` was a stub returning "not implemented" while the dashboard
// carried its own inline Prisma transaction, so the button and the voice agent
// created projects two different ways and only one wrote an audit row. These
// pin the behaviour now that both go through the command.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('create.project integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

interface Created {
  projectId: string
  name: string
  path: string
}

async function create(input: unknown, ctx: CommandContext): Promise<CommandResult<Created>> {
  const command = get('create.project')
  if (!command) throw new Error('create.project is not registered')
  const parsed = command.inputSchema.parse(input)
  const result = await command.execute(parsed, ctx)
  if (result.ok) command.outputSchema.parse(result.data)
  return result as CommandResult<Created>
}

describe.skipIf(!reachable)('create.project', () => {
  let orgA = ''
  let orgB = ''
  let userId = ''
  let ctxA: CommandContext
  let ctxB: CommandContext

  beforeAll(async () => {
    initCommands()
    orgA = (await db.organization.create({ data: { name: `Create A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Create B ${RUN}` } })).id
    userId = (
      await db.user.create({ data: { email: `create-${RUN}-${orgA}@example.test`, passwordHash: 'x' } })
    ).id
    ctxA = { userId, orgId: orgA }
    ctxB = { userId, orgId: orgB }
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  it('creates a project in the caller organisation', async () => {
    const result = await create({ name: `Backyard ${RUN}` }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const row = await db.project.findUnique({
      where: { id: result.data.projectId },
      select: { orgId: true, name: true },
    })
    expect(row?.orgId).toBe(orgA)
    expect(result.data.path).toBe(`/projects/${result.data.projectId}`)
  })

  it('creates the customer along with the project', async () => {
    // "Create a project for the Smith family" is the shape of the request, so a
    // name has to be enough — nobody speaks a customer id.
    const result = await create({ name: `Job ${RUN}`, customerName: `Smith ${RUN}` }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const row = await db.project.findUnique({
      where: { id: result.data.projectId },
      select: { customer: { select: { name: true, orgId: true } } },
    })
    expect(row?.customer?.name).toBe(`Smith ${RUN}`)
    expect(row?.customer?.orgId).toBe(orgA)
  })

  it('reuses a customer rather than duplicating one', async () => {
    // Saying the same family name twice must not leave two customer records.
    const first = await create({ name: `One ${RUN}`, customerName: `Reuse ${RUN}` }, ctxA)
    const second = await create({ name: `Two ${RUN}`, customerName: `reuse ${RUN}` }, ctxA)
    expect(first.ok && second.ok).toBe(true)

    const customers = await db.customer.findMany({
      where: { orgId: orgA, name: { equals: `Reuse ${RUN}`, mode: 'insensitive' } },
      select: { id: true },
    })
    expect(customers).toHaveLength(1)
  })

  it('refuses a customer belonging to another organisation', async () => {
    // A customer id arriving from a voice call is exactly the one to check.
    const theirs = await db.customer.create({ data: { orgId: orgB, name: `Theirs ${RUN}` } })
    const result = await create({ name: `Cross ${RUN}`, customerId: theirs.id }, ctxA)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).not.toMatch(/prisma|Invalid|constraint/i)
  })

  it('does not leave a customer behind when the project cannot be created', async () => {
    // Both happen in one transaction: a customer with no project is a row
    // nothing in the app will ever show.
    const before = await db.customer.count({ where: { orgId: orgA } })
    const result = await create({ name: `Ghost ${RUN}`, customerId: 'not-a-real-id' }, ctxA)
    expect(result.ok).toBe(false)
    expect(await db.customer.count({ where: { orgId: orgA } })).toBe(before)
  })

  it('starts a new project from the default scene when the org has one', async () => {
    // Applied at creation rather than on first open, so the editor, the quote
    // and the proposal all agree from the moment the project exists.
    const payload = { shapes: [{ id: 's1', kind: 'RECTANGLE_POOL', x: 0, y: 0, width: 384, height: 192 }] }
    const template = await db.sceneTemplate.create({
      data: {
        orgId: orgA,
        name: `Default ${RUN}`,
        payload: payload as never,
        objectCount: 1,
        isDefault: true,
      },
    })

    const result = await create({ name: `Templated ${RUN}` }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const drawing = await db.drawing.findUnique({
      where: { projectId: result.data.projectId },
      select: { rootJson: true },
    })
    expect((drawing?.rootJson as { shapes?: unknown[] })?.shapes).toHaveLength(1)

    await db.sceneTemplate.delete({ where: { id: template.id } })
  })

  it('starts empty when the org has no default scene', async () => {
    const result = await create({ name: `Empty ${RUN}` }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const drawing = await db.drawing.findUnique({ where: { projectId: result.data.projectId } })
    expect(drawing).toBeNull()
  })

  it('does not use another organisation default scene', async () => {
    // The starting scene is org property. Borrowing one would put another
    // company's layout into this company's new job.
    const theirs = await db.sceneTemplate.create({
      data: {
        orgId: orgB,
        name: `Theirs ${RUN}`,
        payload: { shapes: [{ id: 'x' }] } as never,
        objectCount: 1,
        isDefault: true,
      },
    })

    const result = await create({ name: `Clean ${RUN}` }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(await db.drawing.findUnique({ where: { projectId: result.data.projectId } })).toBeNull()

    await db.sceneTemplate.delete({ where: { id: theirs.id } })
  })

  it('refuses when there is no organisation on the context', async () => {
    const result = await create({ name: `Anon ${RUN}` }, { userId: 'u', orgId: 'anonymous' })
    expect(result.ok).toBe(false)
  })
})
