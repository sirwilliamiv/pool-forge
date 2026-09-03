// @vitest-environment node
//
// The public proposal-acceptance action is rate limited per address, exactly
// like the intake route: the budget is a Postgres counter, so the ceiling
// holds across instances, and it is spent before the share token is looked
// up, so an address enumerating tokens never reaches the Project table.
// Integration test against the real local Postgres (`pnpm db:up`).

import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'

// The action reads the caller's address through next/headers, which only
// exists inside a request scope. The mock stands in for that scope with a
// fixed forwarded address, so the wiring test exercises the same path an HTTP
// caller takes.
const MOCK_XFF = `203.0.113.199`
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': MOCK_XFF }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
// share.ts pulls in the auth module for its builder-facing actions; the
// public acceptance path never touches it, and next-auth does not resolve
// under the vitest node environment.
vi.mock('@/lib/auth', () => ({ auth: async () => null }))

import { acceptProposal } from '@/modules/projects/share'
import {
  consumeShareAcceptBudget,
  SHARE_ACCEPT_RATE_LIMIT_PER_IP,
  windowStartFor,
} from '@/modules/imports/intake/rate-limit'

const RUN = randomUUID().slice(0, 8)
const BUCKET = `v4:203.0.113.${RUN.length}#${RUN}`

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('share-accept rate limit tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

describe.skipIf(!reachable)('share acceptance per-address budget', () => {
  afterAll(async () => {
    await db.intakeRateCounter.deleteMany({ where: { bucketKey: { contains: RUN } } })
    await db.intakeRateCounter.deleteMany({
      where: { scope: 'share-accept-ip', bucketKey: `v4:${MOCK_XFF}` },
    })
  })

  it('spends the budget before the token is looked up', async () => {
    // A bogus token normally answers "Proposal not found". Once the address
    // budget is exhausted, the same call refuses on the budget instead, which
    // is the proof the counter runs before the Project table is touched.
    let refusal = ''
    for (let i = 0; i < SHARE_ACCEPT_RATE_LIMIT_PER_IP + 1; i += 1) {
      const res = await acceptProposal(`bogus-${RUN}`, 'Dana Reyes')
      expect(res.ok).toBe(false)
      refusal = res.error ?? ''
    }
    expect(refusal).toMatch(/too many attempts/i)
  })

  it('admits exactly the ceiling and refuses the next attempt', async () => {
    const now = new Date()
    for (let i = 0; i < SHARE_ACCEPT_RATE_LIMIT_PER_IP; i += 1) {
      const decision = await consumeShareAcceptBudget(BUCKET, now)
      expect(decision.allowed, `attempt ${i + 1} should be inside the ceiling`).toBe(true)
    }
    const over = await consumeShareAcceptBudget(BUCKET, now)
    expect(over.allowed).toBe(false)
    expect(over.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keeps its counters apart from the intake scopes', async () => {
    const now = new Date()
    const row = await db.intakeRateCounter.findFirst({
      where: { bucketKey: BUCKET, windowStart: windowStartFor(now) },
      select: { scope: true, count: true },
    })
    expect(row?.scope).toBe('share-accept-ip')
    // The ceiling plus the one refused attempt never incremented past it.
    expect(row?.count).toBe(SHARE_ACCEPT_RATE_LIMIT_PER_IP)
  })
})
