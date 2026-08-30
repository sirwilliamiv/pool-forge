// Shared setup for integration tests that hit the real local Postgres
// (`pnpm db:up`). Prisma is not mocked, per repo convention.
//
// Each test file still owns its own cleanup: only the caller knows what else
// it created against an org (price book items, line items, versions...), and
// in what order those have to be deleted before the organisation itself can
// go. This module hands back the ids; it does not track them.

import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'

const RUN = randomUUID().slice(0, 8)

/** Whether the local database is reachable, for a `describe.skipIf`. */
export async function reachableDb(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export interface BootstrappedOrgWithProject {
  orgId: string
  userId: string
  projectId: string
}

/**
 * A fresh organisation with one draft project, scoped to this run and this
 * call so parallel tests never collide on a unique index.
 */
export async function bootstrapOrgWithProject(): Promise<BootstrappedOrgWithProject> {
  const suffix = randomUUID().slice(0, 8)
  const org = await db.organization.create({ data: { name: `IT ${RUN} ${suffix}` } })
  const project = await db.project.create({
    data: { orgId: org.id, name: `IT project ${RUN} ${suffix}` },
  })
  // No real user row: these commands never read ctx.userId, and 'anonymous'
  // is the sentinel dispatchCommand's audit write already maps to a null user
  // rather than a foreign key it would have to satisfy.
  return { orgId: org.id, userId: 'anonymous', projectId: project.id }
}
