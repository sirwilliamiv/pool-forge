// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// `dispatchCommand` writes the audit row centrally (see
// `src/modules/commands/dispatch.ts`), so a command run through it here lands
// a `CommandAuditLog` row the same way a real 'UI' click would.

import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { bootstrapOrgWithProject, reachableDb } from '@/test/integration/bootstrap'

const reachable = await reachableDb()
if (!reachable) {
  console.warn('context.recent integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const createdOrgIds: string[] = []

async function bootstrap() {
  const bootstrapped = await bootstrapOrgWithProject()
  createdOrgIds.push(bootstrapped.orgId)
  return bootstrapped
}

afterAll(async () => {
  if (!reachable || createdOrgIds.length === 0) return
  await db.commandAuditLog.deleteMany({ where: { orgId: { in: createdOrgIds } } })
  await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } })
})

describe.skipIf(!reachable)('context.recent', () => {
  it('reports this org\'s recent commands as sentences, newest first', async () => {
    const { orgId, userId } = await bootstrap()
    const ctx = { userId, orgId }
    await dispatchCommand('create.project', { name: `Recent ${orgId}` }, ctx, 'UI')

    const result = await dispatchCommand('context.recent', {}, ctx, 'API')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const actions = (result.data as { actions: { what: string }[] }).actions
    expect(actions.length).toBeGreaterThan(0)
    expect(actions[0]?.what).toContain('project')
  })

  it('never returns another org\'s rows', async () => {
    const a = await bootstrap()
    const b = await bootstrap()
    await dispatchCommand('create.project', { name: `Secret ${a.orgId}` }, { userId: a.userId, orgId: a.orgId }, 'UI')

    const result = await dispatchCommand('context.recent', {}, { userId: b.userId, orgId: b.orgId }, 'API')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const actions = (result.data as { actions: { what: string }[] }).actions
    expect(actions.every(action => !action.what.includes('Secret'))).toBe(true)
  })

  it('excludes noisy read-only commands like page.read from the recap', async () => {
    const { orgId, userId, projectId } = await bootstrap()
    const ctx = { userId, orgId, projectId }
    await dispatchCommand('create.project', { name: `Noisy ${orgId}` }, ctx, 'UI')
    await dispatchCommand('page.read', {}, ctx, 'VOICE')

    const result = await dispatchCommand('context.recent', {}, ctx, 'API')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const actions = (result.data as { actions: { what: string }[] }).actions
    expect(actions.some(action => action.what.toLowerCase().includes('create project'))).toBe(true)
    expect(actions.some(action => action.what.toLowerCase().includes('read the current page'))).toBe(false)
  })

  it('prefixes the source when the action did not come from the UI', async () => {
    const { orgId, userId } = await bootstrap()
    const ctx = { userId, orgId }
    await dispatchCommand('create.project', { name: `Voice ${orgId}` }, ctx, 'VOICE')

    const result = await dispatchCommand('context.recent', {}, ctx, 'API')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const actions = (result.data as { actions: { what: string }[] }).actions
    expect(actions[0]?.what).toMatch(/^by voice: /)
  })
})
