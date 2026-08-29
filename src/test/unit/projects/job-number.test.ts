// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// The defect: the proposal printed "Proposal #: E6PRSR99", the last eight
// characters of the row's cuid. Nobody can read that back down a phone.
//
// The interesting half of the fix is not the number, it is handing them out.
// A counter in process memory is wrong here for the same reason it is wrong for
// a quota: several Next.js workers each hold their own copy, so two projects
// created in the same second both become 1042. These tests create projects
// concurrently and assert the sequence survives it.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import {
  JOB_NUMBER_START,
  backfillJobNumbers,
  ensureJobNumber,
  nextJobNumber,
} from '@/modules/projects/job-number'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('job number tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

/** Create a project the way every real caller does: numbered in a transaction. */
async function createNumbered(orgId: string, name: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const jobNumber = await nextJobNumber(tx, orgId)
    await tx.project.create({ data: { orgId, name, jobNumber } })
    return jobNumber
  })
}

describe.skipIf(!reachable)('job numbers', () => {
  let orgA = ''
  let orgB = ''

  beforeAll(async () => {
    orgA = (await db.organization.create({ data: { name: `Jobs A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Jobs B ${RUN}` } })).id
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
  })

  it("starts an organisation's first job at a number that looks like a job number", async () => {
    const first = await createNumbered(orgA, `First ${RUN}`)
    expect(first).toBe(JOB_NUMBER_START)
  })

  it('counts up by one', async () => {
    const second = await createNumbered(orgA, `Second ${RUN}`)
    const third = await createNumbered(orgA, `Third ${RUN}`)
    expect(second).toBe(JOB_NUMBER_START + 1)
    expect(third).toBe(JOB_NUMBER_START + 2)
  })

  it('gives every organisation its own sequence', async () => {
    // Org B has three projects in the table before it, all belonging to org A.
    // A global counter would hand B job 1004.
    const first = await createNumbered(orgB, `B first ${RUN}`)
    expect(first).toBe(JOB_NUMBER_START)
  })

  it('hands out no duplicates when eight projects are created at once', async () => {
    const org = (await db.organization.create({ data: { name: `Jobs race ${RUN}` } })).id
    try {
      const numbers = await Promise.all(
        Array.from({ length: 8 }, (_, i) => createNumbered(org, `Race ${i} ${RUN}`)),
      )
      const sorted = [...numbers].sort((a, b) => a - b)
      expect(new Set(numbers).size, `duplicates in ${numbers.join(', ')}`).toBe(8)
      // Gapless as well as unique: a sequence that jumps from 1003 to 1009
      // looks to a builder like six jobs somebody deleted.
      expect(sorted).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => JOB_NUMBER_START + i))
    } finally {
      await db.organization.delete({ where: { id: org } })
    }
  })

  it('never lets two projects in one organisation share a number', async () => {
    // The index is the backstop under the lock. If it were missing, the race
    // test above would be the only thing standing between a builder and two
    // jobs answering to one reference.
    const taken = await createNumbered(orgB, `Taken ${RUN}`)
    await expect(
      db.project.create({ data: { orgId: orgB, name: `Clash ${RUN}`, jobNumber: taken } }),
    ).rejects.toThrow()
  })

  it('lets two organisations use the same number', async () => {
    const rows = await db.project.findMany({
      where: { orgId: { in: [orgA, orgB] }, jobNumber: JOB_NUMBER_START },
      select: { orgId: true },
    })
    expect(rows).toHaveLength(2)
  })
})

describe.skipIf(!reachable)('the command that actually creates projects', () => {
  let orgId = ''

  beforeAll(async () => {
    initCommands()
    orgId = (await db.organization.create({ data: { name: `Create ${RUN}` } })).id
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: orgId } })
  })

  it('numbers a project the moment create.project makes it', async () => {
    // The unit tests above exercise the helper. This one goes through the
    // command a button, a hotkey and the voice agent all dispatch, because a
    // helper nobody calls is the defect this codebase produces most often.
    const command = get('create.project')
    expect(command).toBeDefined()
    if (!command) return

    const result = await command.execute(
      command.inputSchema.parse({ name: `Numbered ${RUN}` }),
      { userId: 'anonymous', orgId },
    )
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok) return

    const { projectId } = result.data as { projectId: string }
    const row = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(row.jobNumber).toBe(JOB_NUMBER_START)
  })

  it('numbers eight projects created through the command at once, with no duplicates', async () => {
    const command = get('create.project')
    if (!command) throw new Error('create.project is not registered')

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        command.execute(command.inputSchema.parse({ name: `Rush ${i} ${RUN}` }), {
          userId: 'anonymous',
          orgId,
        }),
      ),
    )
    for (const result of results) {
      expect(result.ok, result.ok ? '' : result.error).toBe(true)
    }

    const rows = await db.project.findMany({
      where: { orgId, name: { startsWith: 'Rush ' } },
      select: { jobNumber: true },
    })
    const numbers = rows.map((row) => row.jobNumber)
    expect(new Set(numbers).size, `duplicates in ${numbers.join(', ')}`).toBe(8)
    expect(numbers.includes(null)).toBe(false)
  })
})

describe.skipIf(!reachable)('ensureJobNumber', () => {
  let orgId = ''

  beforeAll(async () => {
    orgId = (await db.organization.create({ data: { name: `Ensure ${RUN}` } })).id
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: orgId } })
  })

  it('numbers a project that predates job numbers', async () => {
    const project = await db.project.create({ data: { orgId, name: `Legacy ${RUN}` } })
    expect(project.jobNumber).toBeNull()
    expect(await ensureJobNumber(project.id, orgId)).toBe(JOB_NUMBER_START)
  })

  it('is idempotent: opening the proposal twice does not renumber the job', async () => {
    const project = await db.project.create({ data: { orgId, name: `Twice ${RUN}` } })
    const first = await ensureJobNumber(project.id, orgId)
    const second = await ensureJobNumber(project.id, orgId)
    expect(first).not.toBeNull()
    expect(second).toBe(first)
  })

  it('refuses another organisation, because every query here is org-scoped', async () => {
    const other = await db.organization.create({ data: { name: `Ensure other ${RUN}` } })
    try {
      const project = await db.project.create({ data: { orgId, name: `Scoped ${RUN}` } })
      expect(await ensureJobNumber(project.id, other.id)).toBeNull()
      const row = await db.project.findUniqueOrThrow({ where: { id: project.id } })
      expect(row.jobNumber).toBeNull()
    } finally {
      await db.organization.delete({ where: { id: other.id } })
    }
  })

  it('does not throw at the caller when the same project is numbered concurrently', async () => {
    // Two tabs opening the proposal at once. The user must not be shown a 500
    // because the second request lost a race the first one won.
    const project = await db.project.create({ data: { orgId, name: `Concurrent ${RUN}` } })
    const results = await Promise.all([
      ensureJobNumber(project.id, orgId),
      ensureJobNumber(project.id, orgId),
      ensureJobNumber(project.id, orgId),
    ])
    expect(new Set(results).size).toBe(1)
    expect(results[0]).not.toBeNull()
  })
})

describe.skipIf(!reachable)('backfillJobNumbers', () => {
  it('numbers every existing project, oldest first, with no gaps', async () => {
    const org = (await db.organization.create({ data: { name: `Backfill ${RUN}` } })).id
    try {
      const older = await db.project.create({
        data: { orgId: org, name: `Older ${RUN}`, createdAt: new Date('2026-01-01T00:00:00Z') },
      })
      const newer = await db.project.create({
        data: { orgId: org, name: `Newer ${RUN}`, createdAt: new Date('2026-06-01T00:00:00Z') },
      })

      expect(await backfillJobNumbers(org)).toBe(2)

      const olderRow = await db.project.findUniqueOrThrow({ where: { id: older.id } })
      const newerRow = await db.project.findUniqueOrThrow({ where: { id: newer.id } })
      expect(olderRow.jobNumber).toBe(JOB_NUMBER_START)
      expect(newerRow.jobNumber).toBe(JOB_NUMBER_START + 1)

      // Safe to run twice, which is what makes it safe to run against a live
      // database while the app is serving.
      expect(await backfillJobNumbers(org)).toBe(0)
      const again = await db.project.findUniqueOrThrow({ where: { id: older.id } })
      expect(again.jobNumber).toBe(JOB_NUMBER_START)
    } finally {
      await db.organization.delete({ where: { id: org } })
    }
  })
})
