// @vitest-environment node
//
// The Google Maps proxies are auth-gated but billed per call, so they carry a
// per-address budget from the shared Postgres counter. These prove the ceiling
// is exact and keyed the same way as the other public limiters. Integration
// test against the real local Postgres (`pnpm db:up`).

import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  consumeMapsProxyBudget,
  MAPS_PROXY_RATE_LIMIT_PER_IP,
} from '@/modules/imports/intake/rate-limit'
import { checkMapsProxyBudget } from '@/modules/site/geo/proxy-rate-limit'

const RUN = randomUUID().slice(0, 8)
const BUCKET = `v4:198.51.100.${RUN.length}#${RUN}`
/** A run-distinctive last octet so the forwarded-hop bucket rarely collides. */
const OCT = (parseInt(RUN, 36) % 254) + 1
const HOP_IP = `203.0.113.${OCT}`
const HOP_BUCKET = `v4:${HOP_IP}`

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('maps-proxy limit tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

describe.skipIf(!reachable)('maps proxy per-address budget', () => {
  afterAll(async () => {
    await db.intakeRateCounter.deleteMany({ where: { bucketKey: { contains: RUN } } })
    await db.intakeRateCounter.deleteMany({ where: { scope: 'maps-proxy-ip', bucketKey: HOP_BUCKET } })
  })

  it('admits exactly the ceiling then refuses', async () => {
    const now = new Date()
    for (let i = 0; i < MAPS_PROXY_RATE_LIMIT_PER_IP; i += 1) {
      const d = await consumeMapsProxyBudget(BUCKET, now)
      expect(d.allowed, `call ${i + 1} should be inside the ceiling`).toBe(true)
    }
    const over = await consumeMapsProxyBudget(BUCKET, now)
    expect(over.allowed).toBe(false)
    expect(over.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('derives the bucket from the trusted forwarded hop', async () => {
    // Two requests from the same real client (last XFF hop) share a bucket even
    // if the caller-supplied left entries differ; a spoofed prefix cannot mint
    // a fresh bucket. Measured as a delta so a prior run's rows in the same
    // window do not skew the assertion.
    async function count(): Promise<number> {
      const row = await db.intakeRateCounter.findFirst({
        where: { scope: 'maps-proxy-ip', bucketKey: HOP_BUCKET },
        select: { count: true },
      })
      return row?.count ?? 0
    }
    const headers = (xff: string): Headers => new Headers({ 'x-forwarded-for': xff })
    const before = await count()
    const a = await checkMapsProxyBudget(headers(`1.2.3.4, ${HOP_IP}`))
    const b = await checkMapsProxyBudget(headers(`9.9.9.9, ${HOP_IP}`))
    expect(a.allowed && b.allowed).toBe(true)
    // Both landed in the one bucket keyed on the trusted hop, not the spoofed
    // left entries, so the counter advanced by exactly two.
    expect((await count()) - before).toBe(2)
  })
})
