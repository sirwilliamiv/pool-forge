// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// Status changes, duplicate, archive and delete used to be direct server
// actions: no audit row, and no way for the voice agent to reach them. The
// destructive gate in `src/modules/voice/tools.ts` already named `project.delete`
// and `archive.project` before either was a real command, so a misrecognised
// "delete this project" could never actually be confirmed and run. These pin
// the same lifecycle running through the registry instead.

import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import type { CommandContext } from '@/modules/commands/registry'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn(
    'project lifecycle integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.',
  )
}

const createdOrgIds: string[] = []

interface Bootstrapped {
  orgId: string
  userId: string
  projectId: string
}

/**
 * A fresh organisation with one draft project, scoped to this run and this
 * call so parallel tests never collide on a unique index.
 */
async function bootstrapOrgWithProject(): Promise<Bootstrapped> {
  const suffix = randomUUID().slice(0, 8)
  const org = await db.organization.create({ data: { name: `Lifecycle ${RUN} ${suffix}` } })
  createdOrgIds.push(org.id)
  const project = await db.project.create({
    data: { orgId: org.id, name: `Lifecycle project ${suffix}` },
  })
  // No real user row: these commands never read ctx.userId, and 'anonymous'
  // is the sentinel `dispatchCommand`'s audit write already maps to a null
  // user rather than a foreign key it would have to satisfy.
  return { orgId: org.id, userId: 'anonymous', projectId: project.id }
}

afterAll(async () => {
  if (!reachable || createdOrgIds.length === 0) return
  await db.commandAuditLog.deleteMany({ where: { orgId: { in: createdOrgIds } } })
  await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } })
})

describe.skipIf(!reachable)('project lifecycle commands', () => {
  it('sets status, duplicates, archives and deletes through the registry', async () => {
    const { orgId, userId, projectId } = await bootstrapOrgWithProject()
    const ctx: CommandContext = { userId, orgId }

    const status = await dispatchCommand('project.status.set', { projectId, status: 'APPROVED' }, ctx, 'API')
    expect(status.ok).toBe(true)
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe('APPROVED')

    const dup = await dispatchCommand('project.duplicate', { projectId }, ctx, 'API')
    expect(dup.ok).toBe(true)
    if (!dup.ok) return
    const duplicateId = (dup.data as { projectId: string }).projectId
    expect(duplicateId).not.toBe(projectId)

    const dupRow = await db.project.findUniqueOrThrow({ where: { id: duplicateId } })
    expect(dupRow.orgId).toBe(orgId)
    // A copy is a new draft, not a copy of the source's pipeline position.
    expect(dupRow.status).toBe('DRAFT')

    const archived = await dispatchCommand('project.archive', { projectId: duplicateId }, ctx, 'API')
    expect(archived.ok).toBe(true)
    expect((await db.project.findUniqueOrThrow({ where: { id: duplicateId } })).status).toBe('ARCHIVED')

    const deleted = await dispatchCommand('project.delete', { projectId: duplicateId }, ctx, 'API')
    expect(deleted.ok).toBe(true)
    expect(await db.project.findUnique({ where: { id: duplicateId } })).toBeNull()

    // The source project is untouched by anything that happened to its copy.
    expect(await db.project.findUnique({ where: { id: projectId } })).not.toBeNull()
  })

  it('refuses another org\'s project', async () => {
    const a = await bootstrapOrgWithProject()
    const b = await bootstrapOrgWithProject()

    const result = await dispatchCommand(
      'project.delete',
      { projectId: a.projectId },
      { userId: b.userId, orgId: b.orgId },
      'API',
    )
    expect(result.ok).toBe(false)
    expect(await db.project.findUnique({ where: { id: a.projectId } })).not.toBeNull()
  })

  it('writes exactly one audit row per dispatch, success or failure', async () => {
    const { orgId, userId, projectId } = await bootstrapOrgWithProject()
    const ctx: CommandContext = { userId, orgId }

    await dispatchCommand('project.status.set', { projectId, status: 'PROPOSAL_SENT' }, ctx, 'API')
    const ok = await db.commandAuditLog.findMany({
      where: { orgId, commandId: 'project.status.set' },
    })
    expect(ok).toHaveLength(1)
    expect(ok[0]?.success).toBe(true)
    expect(ok[0]?.source).toBe('API')

    await dispatchCommand('project.archive', { projectId: 'not-a-real-id' }, ctx, 'API')
    const failed = await db.commandAuditLog.findMany({
      where: { orgId, commandId: 'project.archive' },
    })
    expect(failed).toHaveLength(1)
    expect(failed[0]?.success).toBe(false)
  })
})
