// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// project.describe, project.list.describe and settings.team.describe are the
// read-backs that let Marco answer a question about a project or a team
// instead of guessing at it. project.share.create/revoke are the last two
// bypasses a share link had to stop making: `ShareProposalCard` used to call
// `shareProject`/`unshareProject` straight from a client event handler, and
// now goes through the registry like everything else.

import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import type { CommandContext } from '@/modules/commands/registry'
import { bootstrapOrgWithProject, reachableDb } from '@/test/integration/bootstrap'

const reachable = await reachableDb()
if (!reachable) {
  console.warn(
    'describe command integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.',
  )
}

const createdOrgIds: string[] = []

afterAll(async () => {
  if (!reachable || createdOrgIds.length === 0) return
  await db.commandAuditLog.deleteMany({ where: { orgId: { in: createdOrgIds } } })
  await db.project.deleteMany({ where: { orgId: { in: createdOrgIds } } })
  await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } })
})

describe.skipIf(!reachable)('describe and share commands', () => {
  it('project.describe reports status, customer, line items and share state', async () => {
    const { orgId, userId, projectId } = await bootstrapOrgWithProject()
    createdOrgIds.push(orgId)
    const ctx: CommandContext = { userId, orgId }

    const result = await dispatchCommand('project.describe', { projectId }, ctx, 'API')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.data as Record<string, unknown>
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('lineItemSubtotal')
    expect(data).toHaveProperty('shared')
  })

  it('project.describe refuses another org\'s project', async () => {
    const a = await bootstrapOrgWithProject()
    const b = await bootstrapOrgWithProject()
    createdOrgIds.push(a.orgId, b.orgId)

    const result = await dispatchCommand(
      'project.describe',
      { projectId: a.projectId },
      { userId: b.userId, orgId: b.orgId },
      'API',
    )
    expect(result.ok).toBe(false)
  })

  it('project.list.describe counts projects by status', async () => {
    const { orgId, userId } = await bootstrapOrgWithProject()
    createdOrgIds.push(orgId)

    const result = await dispatchCommand('project.list.describe', {}, { userId, orgId }, 'API')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.data as { total: number }).total).toBeGreaterThan(0)
  })

  it('share create then revoke round-trips', async () => {
    const { orgId, userId, projectId } = await bootstrapOrgWithProject()
    createdOrgIds.push(orgId)
    const ctx: CommandContext = { userId, orgId }

    const created = await dispatchCommand('project.share.create', { projectId }, ctx, 'API')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect((created.data as { url: string }).url).toContain('/share/')

    const described = await dispatchCommand('project.describe', { projectId }, ctx, 'API')
    expect(described.ok).toBe(true)
    if (described.ok) expect((described.data as { shared: boolean }).shared).toBe(true)

    const revoked = await dispatchCommand('project.share.revoke', { projectId }, ctx, 'API')
    expect(revoked.ok).toBe(true)

    const afterRevoke = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(afterRevoke.shareToken).toBeNull()
  })

  it('settings.team.describe reports members and never an email address', async () => {
    const { orgId, userId } = await bootstrapOrgWithProject()
    createdOrgIds.push(orgId)

    const result = await dispatchCommand('settings.team.describe', {}, { userId, orgId }, 'API')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.data as { members: unknown[]; ownerCount: number; pendingInvites: number }
    expect(Array.isArray(data.members)).toBe(true)
    expect(typeof data.ownerCount).toBe('number')
    expect(typeof data.pendingInvites).toBe('number')
    // No `@` anywhere in the answer: names and roles only, never an address.
    expect(JSON.stringify(data)).not.toMatch(/@/)
  })
})
