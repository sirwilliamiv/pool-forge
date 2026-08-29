import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// A number a builder can say on the phone.
//
// The proposal printed "Proposal #: E6PRSR99", which is the last eight
// characters of the row's cuid. Nobody can read that back to a customer, nobody
// can find it in a filing cabinet, and it changes shape between jobs. Every
// project now gets a per-organisation sequential job number instead.
//
// Two things make this safe under concurrency, and neither is a counter in
// process memory: several Next.js workers each holding their own idea of the
// next number is exactly how two projects end up as job 1042.
//
//  1. A Postgres advisory lock keyed on the organisation, taken inside the same
//     transaction that reads MAX and writes the row. Two projects created in the
//     same millisecond queue behind each other rather than both reading 1041.
//  2. The `[orgId, jobNumber]` unique index, and a retry when it fires anyway.
//     The lock covers this module; the index covers a write that reaches the
//     table by some path this module does not own. A duplicate is retried rather
//     than surfacing to the user as a 500.

/** Where an organisation's first job number starts. */
export const JOB_NUMBER_START = 1001

/**
 * Namespace for the advisory lock, so this lock cannot collide with any other
 * advisory lock the application takes later on an unrelated key.
 */
const LOCK_NAMESPACE = 4021

/** How many times to re-read and retry when the unique index rejects a write. */
const MAX_ATTEMPTS = 5

/** Prisma raises P2002 when `[orgId, jobNumber]` is already taken. */
function isDuplicateJobNumber(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * Take the organisation's numbering lock for the rest of this transaction.
 *
 * Held until commit or rollback, so everything read after this call is read
 * with every other numbering transaction for this organisation queued behind
 * it. Re-entrant: taking it twice in one transaction is free.
 *
 * Every read that decides a job number must happen AFTER this. Reading first
 * and locking second is not a lock at all, and it is exactly the bug the
 * concurrency test caught: three requests numbering one project each read null,
 * then queued politely and each assigned a different number.
 */
async function lockOrgNumbering(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  // `$executeRaw`, not `$queryRaw`: `pg_advisory_xact_lock` returns void, and
  // Prisma cannot deserialize a void column.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${orgId}::text))`
}

/**
 * The next job number for an organisation, with the assignment serialised.
 *
 * MUST be called inside an interactive transaction: the advisory lock is held
 * for the life of that transaction, which is what stops two concurrent creates
 * reading the same MAX. Call it and write the number in the same transaction.
 */
export async function nextJobNumber(tx: Prisma.TransactionClient, orgId: string): Promise<number> {
  await lockOrgNumbering(tx, orgId)
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX("jobNumber")::int AS max FROM "Project" WHERE "orgId" = ${orgId}::text
  `
  const max = rows[0]?.max ?? null
  return max === null ? JOB_NUMBER_START : max + 1
}

/**
 * Give a project a job number if it has not got one, and return it.
 *
 * Idempotent, org-scoped, and safe to call on a page that is about to print a
 * document: projects created before job numbers existed have none, and a
 * proposal with a blank where the reference number goes is the problem this
 * whole module exists to remove.
 *
 * Returns null when the project is not this organisation's, or when the write
 * lost the race five times running. Null rather than a throw because the caller
 * is usually rendering: a document that prints without a number is a smaller
 * failure than a document that does not print.
 */
export async function ensureJobNumber(projectId: string, orgId: string): Promise<number | null> {
  const existing = await db.project.findFirst({
    where: { id: projectId, orgId },
    select: { jobNumber: true },
  })
  if (!existing) return null
  if (existing.jobNumber !== null) return existing.jobNumber

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const assigned = await db.$transaction(async (tx) => {
        // Lock BEFORE re-reading. Another request may have numbered this same
        // project between the read above and this transaction starting, and
        // only a read taken under the lock is guaranteed to see it.
        await lockOrgNumbering(tx, orgId)

        const fresh = await tx.project.findFirst({
          where: { id: projectId, orgId },
          select: { jobNumber: true },
        })
        if (!fresh) return null
        if (fresh.jobNumber !== null) return fresh.jobNumber

        const number = await nextJobNumber(tx, orgId)
        await tx.project.update({ where: { id: projectId }, data: { jobNumber: number } })
        return number
      })
      return assigned
    } catch (error) {
      if (isDuplicateJobNumber(error)) continue
      throw error
    }
  }

  console.warn(`[job-number] could not assign a job number for project ${projectId}`)
  return null
}

/**
 * Number every project in an organisation that has none, oldest first.
 *
 * For rows that predate job numbers. Ordered by creation so the sequence a
 * builder sees matches the order they actually took the work on.
 */
export async function backfillJobNumbers(orgId: string): Promise<number> {
  const pending = await db.project.findMany({
    where: { orgId, jobNumber: null },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  let assigned = 0
  for (const project of pending) {
    const number = await ensureJobNumber(project.id, orgId)
    if (number !== null) assigned += 1
  }
  return assigned
}
