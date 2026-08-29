// @vitest-environment node
//
// The studio's one write is a public endpoint, so the properties worth proving
// are the ones a stranger could exploit: that the reply never depends on
// whether an address has been here before, that a bot filling the honeypot
// learns nothing, and that the ceiling is exact rather than approximately
// enforced. None of those can be observed against a mocked Prisma, so these run
// against the real local Postgres (`pnpm db:up`).
//
// Every address and every rate-limit key carries a run-scoped id, so parallel
// runs and incomplete teardown cannot collide.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { DREAM_LEAD_MESSAGES } from '@/modules/dream/lead/errors'
import { handleDreamLead } from '@/modules/dream/lead/handler'
import {
  consumeDreamLeadAttempt,
  DREAM_LEAD_IP_RULE,
  dreamLeadRateKey,
  sweepExpiredDreamRateCounters,
} from '@/modules/dream/lead/rate-limit'
import { recordDreamLead } from '@/modules/dream/lead/record'
import { dreamLeadSchema } from '@/modules/dream/lead/schema'
import { DEFAULT_DREAM } from '@/modules/dream/config'
import { priceDream } from '@/modules/dream/pricing'
import { encodeDream } from '@/modules/dream/share'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('dream lead tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const describeDb = reachable ? describe : describe.skip

function email(label: string): string {
  return `dr-${RUN}-${label}@example.test`
}

function bucket(label: string): string {
  return `v4:drtest-${RUN}-${label}`
}

/** A payload the schema accepts, built from a real design. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ballpark = priceDream(DEFAULT_DREAM)
  return {
    email: email('base'),
    design: encodeDream(DEFAULT_DREAM),
    ballparkLow: ballpark.low,
    ballparkHigh: ballpark.high,
    ...overrides,
  }
}

async function rowsFor(address: string) {
  return db.dreamDesign.findMany({ where: { email: address }, orderBy: { createdAt: 'asc' } })
}

async function cleanup(): Promise<void> {
  await db.$executeRaw`DELETE FROM "DreamDesign" WHERE "email" LIKE ${`%${RUN}%`}`
  await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "key" LIKE ${`%drtest-${RUN}%`}`
}

afterAll(async () => {
  await cleanup()
  await db.$disconnect()
})

// ─────────────────────────── input ───────────────────────────

describe('what the form will accept', () => {
  it('lower-cases and trims the address', () => {
    const parsed = dreamLeadSchema.parse(payload({ email: '  Sam@Example.TEST ' }))
    expect(parsed.email).toBe('sam@example.test')
  })

  it('refuses something that is not an address', () => {
    expect(dreamLeadSchema.safeParse(payload({ email: 'sam at example' })).success).toBe(false)
  })

  it('refuses a submission with no design attached', () => {
    // A lead with no design is a bare email address collected on a page that
    // promised to send somebody a drawing. There is nothing to send.
    expect(dreamLeadSchema.safeParse(payload({ design: '' })).success).toBe(false)
  })

  it('treats an empty optional field as unanswered, not as an empty answer', () => {
    const parsed = dreamLeadSchema.parse(payload({ name: '   ', postcode: '' }))
    expect(parsed.name).toBeUndefined()
    expect(parsed.postcode).toBeUndefined()
  })

  it('drops a timeframe that is not on the list rather than storing typed text', () => {
    const parsed = dreamLeadSchema.parse(payload({ timeframe: 'whenever i feel like it' }))
    expect(parsed.timeframe).toBeUndefined()
    expect(dreamLeadSchema.parse(payload({ timeframe: 'this-year' })).timeframe).toBe('this-year')
  })

  it('bounds every text field, so the table cannot be filled from outside', () => {
    const long = 'x'.repeat(5000)
    expect(dreamLeadSchema.safeParse(payload({ name: long })).success).toBe(false)
    expect(dreamLeadSchema.safeParse(payload({ design: long })).success).toBe(false)
    expect(dreamLeadSchema.safeParse(payload({ postcode: long })).success).toBe(false)
  })

  it('refuses a ballpark that is not a plain whole number of dollars', () => {
    expect(dreamLeadSchema.safeParse(payload({ ballparkLow: -1 })).success).toBe(false)
    expect(dreamLeadSchema.safeParse(payload({ ballparkHigh: 1e12 })).success).toBe(false)
    expect(dreamLeadSchema.safeParse(payload({ ballparkLow: 12_345.67 })).success).toBe(false)
  })
})

// ─────────────────────────── writing ───────────────────────────

describeDb('recording a lead', () => {
  beforeEach(cleanup)

  it('stores the design and the range the visitor was actually shown', async () => {
    const address = email('stores')
    const ballpark = priceDream(DEFAULT_DREAM)
    await recordDreamLead(
      dreamLeadSchema.parse(payload({ email: address, name: 'Sam', postcode: '33701', timeframe: 'ready' })),
    )

    const rows = await rowsFor(address)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.design).toBe(encodeDream(DEFAULT_DREAM))
    expect(rows[0]?.ballparkLow).toBe(ballpark.low)
    expect(rows[0]?.ballparkHigh).toBe(ballpark.high)
    expect(rows[0]?.name).toBe('Sam')
    expect(rows[0]?.routedAt).toBeNull()
  })

  it('keeps both designs when one person saves two', async () => {
    // The reason this is an insert and the waitlist is an upsert. A couple
    // deciding between a compact pool and an estate pool have told a builder
    // two different and equally real things.
    const address = email('two')
    const compact = { ...DEFAULT_DREAM, size: 'compact' }
    const estate = { ...DEFAULT_DREAM, size: 'estate' }

    for (const config of [compact, estate]) {
      const ballpark = priceDream(config)
      await recordDreamLead(
        dreamLeadSchema.parse({
          email: address,
          design: encodeDream(config),
          ballparkLow: ballpark.low,
          ballparkHigh: ballpark.high,
        }),
      )
    }

    const rows = await rowsFor(address)
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.design)).size).toBe(2)
  })

  it('leaves an unanswered field NULL rather than storing an empty string', async () => {
    const address = email('nulls')
    await recordDreamLead(dreamLeadSchema.parse(payload({ email: address })))
    const rows = await rowsFor(address)
    expect(rows[0]?.name).toBeNull()
    expect(rows[0]?.postcode).toBeNull()
    expect(rows[0]?.timeframe).toBeNull()
  })
})

// ─────────────────────────── the endpoint ───────────────────────────

describeDb('what a stranger is told', () => {
  beforeEach(cleanup)

  it('answers a first and a second submission from one address identically', async () => {
    const address = email('oracle')
    const first = await handleDreamLead(payload({ email: address }), bucket('oracle'))
    const second = await handleDreamLead(payload({ email: address }), bucket('oracle'))
    // Anything that differed here would let somebody type a neighbour's address
    // and learn whether that person has been pricing a pool.
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
  })

  it('accepts a bot the same way it accepts a person, and writes nothing', async () => {
    const address = email('bot')
    const outcome = await handleDreamLead(
      { ...payload({ email: address }), website: 'https://example.test' },
      bucket('bot'),
    )
    expect(outcome).toEqual({ ok: true, status: 200 })
    expect(await rowsFor(address)).toHaveLength(0)
  })

  it('refuses a payload it cannot read, without saying what was wrong with it', async () => {
    const outcome = await handleDreamLead({ email: 'nope' }, bucket('invalid'))
    expect(outcome).toEqual({ ok: false, status: 400, error: DREAM_LEAD_MESSAGES.invalid })
  })

  it('spends the ceiling on refused attempts as well as accepted ones', async () => {
    // A refund on failure would make "send junk" the way to keep the bucket
    // empty, which is exactly what a flooder does.
    const key = bucket('mixed')
    for (let i = 0; i < DREAM_LEAD_IP_RULE.ceiling; i += 1) {
      await handleDreamLead({ email: 'not-an-address' }, key)
    }
    const outcome = await handleDreamLead(payload({ email: email('mixed') }), key)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe(429)
  })
})

describeDb('the ceiling', () => {
  beforeEach(cleanup)

  it('allows exactly the stated number of attempts in a window', async () => {
    const key = bucket('exact')
    const now = new Date()
    for (let i = 0; i < DREAM_LEAD_IP_RULE.ceiling; i += 1) {
      const gate = await consumeDreamLeadAttempt(key, now)
      expect(gate.allowed).toBe(true)
    }
    expect((await consumeDreamLeadAttempt(key, now)).allowed).toBe(false)
  })

  it('names no exact wait a flooder could calibrate against', async () => {
    const key = bucket('retry')
    const gate = await consumeDreamLeadAttempt(key, new Date())
    expect(gate.retryAfterSeconds).toBeGreaterThan(0)
    expect(gate.retryAfterSeconds).toBeLessThanOrEqual(DREAM_LEAD_IP_RULE.windowMs / 1000)
    expect(DREAM_LEAD_MESSAGES.throttled).not.toMatch(/\d/)
  })

  it('rolls over into the next window', async () => {
    const key = bucket('roll')
    const now = new Date()
    for (let i = 0; i < DREAM_LEAD_IP_RULE.ceiling; i += 1) await consumeDreamLeadAttempt(key, now)
    expect((await consumeDreamLeadAttempt(key, now)).allowed).toBe(false)

    const later = new Date(now.getTime() + DREAM_LEAD_IP_RULE.windowMs)
    expect((await consumeDreamLeadAttempt(key, later)).allowed).toBe(true)
  })

  it('sweeps only its own rows, never another feature\'s live buckets', async () => {
    const foreign = `waitlist:ip:v4:drtest-${RUN}-foreign`
    await db.rateLimitCounter.create({
      data: { key: foreign, windowStart: new Date(0), count: 1 },
    })
    await consumeDreamLeadAttempt(bucket('sweep'), new Date(0))

    await sweepExpiredDreamRateCounters(new Date())

    const mine = await db.rateLimitCounter.findMany({
      where: { key: dreamLeadRateKey(bucket('sweep')) },
    })
    const theirs = await db.rateLimitCounter.findMany({ where: { key: foreign } })
    expect(mine).toHaveLength(0)
    expect(theirs).toHaveLength(1)

    await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "key" = ${foreign}`
  })
})
