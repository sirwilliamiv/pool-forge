// @vitest-environment node
//
// Integration test for the intake link management commands. Real Postgres, no
// Prisma mock: deactivation is a security control, and the assertion that
// matters is that it stops the public route, not that a boolean flipped.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'
import { listIntakeLinks, resolveIntakeLink } from '@/modules/imports/intake/links'
import type { IntakeLinkOutput } from '@/modules/imports/intake/schema'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('intake command tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

async function run<T>(id: string, input: unknown, ctx: CommandContext): Promise<CommandResult<T>> {
  const cmd = get(id)
  if (!cmd) throw new Error(`command not registered: ${id}`)
  const parsed = cmd.inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  const result = await cmd.execute(parsed.data, ctx)
  if (result.ok) cmd.outputSchema.parse(result.data)
  return result as CommandResult<T>
}

describe.skipIf(!reachable)('intake link commands', () => {
  let orgA = ''
  let orgB = ''
  let ctxA: CommandContext
  let ctxB: CommandContext

  beforeAll(async () => {
    initCommands()
    const a = await db.organization.create({ data: { name: `Intake Cmd A ${RUN}` } })
    const b = await db.organization.create({ data: { name: `Intake Cmd B ${RUN}` } })
    orgA = a.id
    orgB = b.id
    ctxA = { userId: `user-a-${RUN}`, orgId: orgA }
    ctxB = { userId: `user-b-${RUN}`, orgId: orgB }
  })

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  })

  it('registers the three link commands under the settings category', () => {
    // The intake UI lives at /settings/intake, which maps to the settings
    // voice screen, so the commands are reachable from where they actually
    // appear rather than from the import pipeline screen.
    for (const id of [
      'import.intake.link.create',
      'import.intake.link.update',
      'import.intake.link.list',
    ]) {
      const cmd = get(id)
      expect(cmd, `${id} is missing`).toBeDefined()
      expect(cmd?.category).toBe('settings')
    }
  })

  it('refuses to run without an org', async () => {
    const result = await run('import.intake.link.create', { label: 'Nope' }, {
      userId: 'anonymous',
      orgId: 'anonymous',
    })
    expect(result.ok).toBe(false)
  })

  it('creates a link that the public route can resolve', async () => {
    const result = await run<IntakeLinkOutput>(
      'import.intake.link.create',
      { label: `  Spring   campaign ${RUN}  ` },
      ctxA,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Whitespace is normalized, not rejected.
    expect(result.data.label).toBe(`Spring campaign ${RUN}`)
    expect(result.data.active).toBe(true)
    expect(result.data.submissionCount).toBe(0)

    const resolved = await resolveIntakeLink(result.data.token)
    expect(resolved?.orgId).toBe(orgA)
  })

  it('rejects an empty label at the schema boundary', async () => {
    const result = await run('import.intake.link.create', { label: '   ' }, ctxA)
    expect(result.ok).toBe(false)
  })

  it('deactivating a link stops the public route resolving it', async () => {
    const created = await run<IntakeLinkOutput>(
      'import.intake.link.create',
      { label: `Temp ${RUN}` },
      ctxA,
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(await resolveIntakeLink(created.data.token)).not.toBeNull()

    const off = await run<IntakeLinkOutput>(
      'import.intake.link.update',
      { linkId: created.data.linkId, active: false },
      ctxA,
    )
    expect(off.ok).toBe(true)
    expect(await resolveIntakeLink(created.data.token)).toBeNull()

    const back = await run<IntakeLinkOutput>(
      'import.intake.link.update',
      { linkId: created.data.linkId, active: true },
      ctxA,
    )
    expect(back.ok).toBe(true)
    expect(await resolveIntakeLink(created.data.token)).not.toBeNull()
  })

  it('setting an expiry in the past stops the public route resolving it', async () => {
    const created = await run<IntakeLinkOutput>(
      'import.intake.link.create',
      { label: `Expiring ${RUN}` },
      ctxA,
    )
    if (!created.ok) throw new Error('create failed')

    const updated = await run<IntakeLinkOutput>(
      'import.intake.link.update',
      { linkId: created.data.linkId, expiresAt: new Date(Date.now() - 1000).toISOString() },
      ctxA,
    )
    expect(updated.ok).toBe(true)
    expect(await resolveIntakeLink(created.data.token)).toBeNull()
  })

  it('cannot rename or deactivate a link belonging to another org', async () => {
    const created = await run<IntakeLinkOutput>(
      'import.intake.link.create',
      { label: `Owned by A ${RUN}` },
      ctxA,
    )
    if (!created.ok) throw new Error('create failed')

    const attacked = await run<IntakeLinkOutput>(
      'import.intake.link.update',
      { linkId: created.data.linkId, active: false, label: 'pwned' },
      ctxB,
    )
    expect(attacked.ok).toBe(false)

    // Not merely refused: unchanged, and still live.
    expect(await resolveIntakeLink(created.data.token)).not.toBeNull()
    const row = await db.intakeLink.findUnique({ where: { id: created.data.linkId } })
    expect(row?.label).toBe(`Owned by A ${RUN}`)
    expect(row?.active).toBe(true)
  })

  it('lists only the links belonging to the calling org', async () => {
    await run('import.intake.link.create', { label: `B only ${RUN}` }, ctxB)

    const listA = await run<{ links: IntakeLinkOutput[] }>('import.intake.link.list', {}, ctxA)
    const listB = await run<{ links: IntakeLinkOutput[] }>('import.intake.link.list', {}, ctxB)
    if (!listA.ok || !listB.ok) throw new Error('list failed')

    expect(listB.data.links).toHaveLength(1)
    expect(listB.data.links[0]?.label).toBe(`B only ${RUN}`)
    expect(listA.data.links.some((l) => l.label === `B only ${RUN}`)).toBe(false)

    // The module-level reader agrees with the command.
    const direct = await listIntakeLinks(orgB)
    expect(direct).toHaveLength(1)
  })

  it('refuses an update that changes nothing', async () => {
    const created = await run<IntakeLinkOutput>(
      'import.intake.link.create',
      { label: `Noop ${RUN}` },
      ctxA,
    )
    if (!created.ok) throw new Error('create failed')
    const result = await run('import.intake.link.update', { linkId: created.data.linkId }, ctxA)
    expect(result.ok).toBe(false)
  })
})
