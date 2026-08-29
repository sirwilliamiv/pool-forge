// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// The defect: a customer signed a shared proposal, the project page printed
// "Accepted by Dana Reyes on August 22, 2026", and the status dropdown still
// read Draft. The app defines a pipeline and a signature moved the project
// through none of it.
//
// The acceptance arrives on a PUBLIC route with no session, so the org can only
// come from the project the share token resolved to. These tests pin that: the
// command refuses an org that does not own the project, which is what makes it
// safe to run org-scoped work with an anonymous caller.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// `share.ts` is a server-action module: it pulls in next-auth for the two
// owner-scoped actions beside `acceptProposal`, and next-auth's entry point
// does not resolve under vitest. Neither is used by the public path under test.
vi.mock('@/lib/auth', () => ({ auth: async () => null }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'
import { statusAfterAcceptance } from '@/modules/commands/categories/project'

const RUN = randomUUID().slice(0, 8)
const COMMAND = 'project.proposal.accept'

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn(
    'proposal acceptance integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.',
  )
}

interface AcceptOutput {
  projectId: string
  status: string
  previousStatus: string
  statusChanged: boolean
  acceptedName: string
  acceptedAt: string
  alreadyAccepted: boolean
}

async function run(input: unknown, ctx: CommandContext): Promise<CommandResult<AcceptOutput>> {
  const cmd = get(COMMAND)
  if (!cmd) throw new Error(`command not registered: ${COMMAND}`)
  const parsed = cmd.inputSchema.parse(input)
  const result = await cmd.execute(parsed, ctx)
  if (result.ok) cmd.outputSchema.parse(result.data)
  return result as CommandResult<AcceptOutput>
}

describe('statusAfterAcceptance', () => {
  it('advances anything short of approved to approved', () => {
    expect(statusAfterAcceptance('DRAFT')).toBe('APPROVED')
    expect(statusAfterAcceptance('READY_FOR_REVIEW')).toBe('APPROVED')
    expect(statusAfterAcceptance('PROPOSAL_SENT')).toBe('APPROVED')
  })

  it('never walks a project backwards', () => {
    expect(statusAfterAcceptance('APPROVED')).toBe('APPROVED')
    expect(statusAfterAcceptance('CONSTRUCTION_READY')).toBe('CONSTRUCTION_READY')
  })

  it('leaves an archived project archived, because archiving is off the pipeline', () => {
    expect(statusAfterAcceptance('ARCHIVED')).toBe('ARCHIVED')
  })
})

describe.skipIf(!reachable)('project.proposal.accept', () => {
  let orgA = ''
  let orgB = ''
  let projectId = ''
  let ctxA: CommandContext
  let ctxB: CommandContext

  beforeAll(async () => {
    initCommands()
    orgA = (await db.organization.create({ data: { name: `Accept A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Accept B ${RUN}` } })).id
    ctxA = { userId: 'anonymous', orgId: orgA }
    ctxB = { userId: 'anonymous', orgId: orgB }
  })

  afterAll(async () => {
    if (!reachable) return
    await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
  })

  beforeEach(async () => {
    const project = await db.project.create({
      data: { orgId: orgA, name: `Accept ${RUN} ${randomUUID().slice(0, 6)}` },
    })
    projectId = project.id
  })

  it('is registered under the project category', () => {
    const cmd = get(COMMAND)
    expect(cmd?.category).toBe('project')
    expect(cmd?.unimplemented).toBeUndefined()
  })

  it('moves the project to approved and records who signed', async () => {
    const result = await run({ projectId, acceptedName: 'Dana Reyes' }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.previousStatus).toBe('DRAFT')
    expect(result.data.status).toBe('APPROVED')
    expect(result.data.statusChanged).toBe(true)

    const row = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(row.status).toBe('APPROVED')
    expect(row.proposalAcceptedName).toBe('Dana Reyes')
    expect(row.proposalAcceptedAt).not.toBeNull()
  })

  it('refuses when the org does not own the project', async () => {
    const result = await run({ projectId, acceptedName: 'Dana Reyes' }, ctxB)
    expect(result.ok).toBe(false)

    const row = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(row.status).toBe('DRAFT')
    expect(row.proposalAcceptedAt).toBeNull()
  })

  it('refuses an anonymous org outright', async () => {
    const result = await run(
      { projectId, acceptedName: 'Dana Reyes' },
      { userId: 'anonymous', orgId: 'anonymous' },
    )
    expect(result.ok).toBe(false)
  })

  it('keeps the first signature when the customer accepts twice', async () => {
    const first = await run({ projectId, acceptedName: 'Dana Reyes' }, ctxA)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = await run({ projectId, acceptedName: 'Somebody Else' }, ctxA)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.data.alreadyAccepted).toBe(true)
    expect(second.data.acceptedName).toBe('Dana Reyes')
    expect(second.data.acceptedAt).toBe(first.data.acceptedAt)

    const row = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(row.proposalAcceptedName).toBe('Dana Reyes')
  })

  it('does not drag a project already in construction back to approved', async () => {
    await db.project.update({ where: { id: projectId }, data: { status: 'CONSTRUCTION_READY' } })
    const result = await run({ projectId, acceptedName: 'Dana Reyes' }, ctxA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.statusChanged).toBe(false)
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe(
      'CONSTRUCTION_READY',
    )
  })

  it('rejects an empty signature at the schema, before any write', async () => {
    const cmd = get(COMMAND)!
    expect(cmd.inputSchema.safeParse({ projectId, acceptedName: '   ' }).success).toBe(false)
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe('DRAFT')
  })
})

// The public entry point. `acceptProposal` takes a token and a name and nothing
// else, so there is no org or project id on the wire to forge, and it dispatches
// through the registry so the audit log records the acceptance the same way it
// records a status a builder changed by hand.
describe.skipIf(!reachable)('the public share acceptance route', () => {
  let orgId = ''
  let projectId = ''
  let token = ''

  beforeAll(async () => {
    initCommands()
    orgId = (await db.organization.create({ data: { name: `Accept Public ${RUN}` } })).id
    token = `tok-${RUN}-${randomUUID()}`
    projectId = (
      await db.project.create({
        data: {
          orgId,
          name: `Public accept ${RUN}`,
          status: 'PROPOSAL_SENT',
          shareToken: token,
          sharedAt: new Date(),
        },
      })
    ).id
  })

  afterAll(async () => {
    if (!reachable) return
    await db.commandAuditLog.deleteMany({ where: { orgId } })
    await db.organization.deleteMany({ where: { id: orgId } })
  })

  it('advances the project and writes one audit row scoped to the project org', async () => {
    const { acceptProposal } = await import('@/modules/projects/share')

    const result = await acceptProposal(token, 'Dana Reyes')
    expect(result.ok).toBe(true)

    const row = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(row.status).toBe('APPROVED')
    expect(row.proposalAcceptedName).toBe('Dana Reyes')

    const audits = await db.commandAuditLog.findMany({
      where: { commandId: COMMAND, orgId },
      orderBy: { ranAt: 'desc' },
    })
    expect(audits).toHaveLength(1)
    expect(audits[0]?.success).toBe(true)
    expect(audits[0]?.source).toBe('API')
    // The signer is a customer, not a member of the org.
    expect(audits[0]?.userId).toBeNull()
    // The org came off the project the token resolved to, not off the caller.
    expect(audits[0]?.orgId).toBe(orgId)
  })

  it('refuses a token that resolves to nothing, and writes no audit row for it', async () => {
    const { acceptProposal } = await import('@/modules/projects/share')
    const before = await db.commandAuditLog.count({ where: { commandId: COMMAND, orgId } })

    const result = await acceptProposal(`no-such-token-${RUN}`, 'Mallory')
    expect(result.ok).toBe(false)

    expect(await db.commandAuditLog.count({ where: { commandId: COMMAND, orgId } })).toBe(before)
  })

  it('refuses an empty name without touching the project', async () => {
    const { acceptProposal } = await import('@/modules/projects/share')
    const result = await acceptProposal(token, '   ')
    expect(result.ok).toBe(false)
  })
})
