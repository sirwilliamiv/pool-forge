// @vitest-environment node
//
// The front door is a public write endpoint, so the properties worth proving
// are the ones a stranger could exploit: that the reply never depends on
// whether an address is already on the list, that a second submission cannot
// overwrite the first, and that the ceiling is exact rather than approximately
// enforced. None of those can be observed against a mocked Prisma, so these run
// against the real local Postgres (`pnpm db:up`).
//
// Every address and every rate-limit key carries a run-scoped id, so parallel
// runs and incomplete teardown cannot collide.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { handleWaitlistSubmission } from '@/modules/waitlist/handler'
import { WAITLIST_MESSAGES } from '@/modules/waitlist/errors'
import { recordWaitlistSignup } from '@/modules/waitlist/signup'
import {
  consumeWaitlistAttempt,
  sweepExpiredWaitlistRateCounters,
  waitlistRateKey,
  WAITLIST_IP_RULE,
} from '@/modules/waitlist/rate-limit'
import { waitlistSignupSchema } from '@/modules/waitlist/schema'
import {
  listWaitlistSignups,
  parseSignupSort,
  setWaitlistInvited,
} from '@/modules/waitlist/admin'
import { isWaitlistOperator, waitlistOperatorEmails } from '@/modules/waitlist/operators'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('waitlist tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const describeDb = reachable ? describe : describe.skip

/** An address nothing else in the suite, or in the app, will touch. */
function email(label: string): string {
  return `wl-${RUN}-${label}@example.test`
}

/** A bucket key of this run's own. */
function bucket(label: string): string {
  return `v4:wltest-${RUN}-${label}`
}

async function rowFor(address: string) {
  return db.waitlistSignup.findUnique({ where: { email: address } })
}

async function cleanup(): Promise<void> {
  await db.$executeRaw`DELETE FROM "WaitlistSignup" WHERE "email" LIKE ${`%${RUN}%`}`
  await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "key" LIKE ${`%wltest-${RUN}%`}`
}

afterAll(async () => {
  await cleanup()
  await db.$disconnect()
})

// ─────────────────────────── input ───────────────────────────

describe('what the form will accept', () => {
  it('lower-cases and trims the address, so one person is one row', () => {
    const parsed = waitlistSignupSchema.parse({ email: '  Sam@Example.TEST ' })
    expect(parsed.email).toBe('sam@example.test')
  })

  it('refuses something that is not an address', () => {
    expect(waitlistSignupSchema.safeParse({ email: 'sam at example' }).success).toBe(false)
  })

  it('treats an empty optional field as unanswered, not as an empty answer', () => {
    const parsed = waitlistSignupSchema.parse({ email: 'sam@example.test', name: '   ', note: '' })
    expect(parsed.name).toBeUndefined()
    expect(parsed.note).toBeUndefined()
  })

  it('drops a choice that is not on the list rather than storing typed text', () => {
    const parsed = waitlistSignupSchema.parse({
      email: 'sam@example.test',
      teamSize: '<script>alert(1)</script>',
      usesToday: 'spreadsheet',
    })
    expect(parsed.teamSize).toBeUndefined()
    expect(parsed.usesToday).toBe('spreadsheet')
  })

  it('refuses a note longer than the column is meant to hold', () => {
    const parsed = waitlistSignupSchema.safeParse({
      email: 'sam@example.test',
      note: 'x'.repeat(2001),
    })
    expect(parsed.success).toBe(false)
  })
})

// ─────────────────────────── recording ───────────────────────────

describeDb('recording a signup', () => {
  it('writes the answers, including the two that decide who gets a call', async () => {
    const address = email('record')
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({
        email: address,
        name: 'Sam Rivera',
        company: 'Rivera Pools',
        phone: '555 0100',
        teamSize: '6-15',
        usesToday: 'spreadsheet',
        note: 'Forty pools a year.',
        source: 'referral',
      }),
    )

    const row = await rowFor(address)
    expect(row?.name).toBe('Sam Rivera')
    expect(row?.teamSize).toBe('6-15')
    expect(row?.usesToday).toBe('spreadsheet')
    expect(row?.invitedAt).toBeNull()
  })

  it('leaves one row for one address, however many times it is submitted', async () => {
    const address = email('dupe')
    const input = waitlistSignupSchema.parse({ email: address, name: 'First Answer' })
    await recordWaitlistSignup(input)
    await recordWaitlistSignup(input)
    await recordWaitlistSignup(input)

    const rows = await db.waitlistSignup.findMany({ where: { email: address } })
    expect(rows).toHaveLength(1)
  })

  it('cannot be used to overwrite what somebody already said', async () => {
    // The endpoint is public, so the address proves nothing. If a later
    // submission won, anyone who knew a builder's address could scribble over
    // that builder's record or empty it.
    const address = email('overwrite')
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({
        email: address,
        name: 'Sam Rivera',
        company: 'Rivera Pools',
        teamSize: '6-15',
      }),
    )
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({
        email: address,
        name: 'Impostor',
        company: 'Nowhere',
        teamSize: 'just-me',
        phone: '555 0199',
      }),
    )

    const row = await rowFor(address)
    expect(row?.name).toBe('Sam Rivera')
    expect(row?.company).toBe('Rivera Pools')
    expect(row?.teamSize).toBe('6-15')
    // A blank the first submission left may still be filled in.
    expect(row?.phone).toBe('555 0199')
  })

  it('cannot be used to un-invite somebody', async () => {
    const address = email('uninvite')
    await recordWaitlistSignup(waitlistSignupSchema.parse({ email: address }))
    const row = await rowFor(address)
    await setWaitlistInvited(row!.id, true)

    await recordWaitlistSignup(waitlistSignupSchema.parse({ email: address, name: 'Impostor' }))

    expect((await rowFor(address))?.invitedAt).not.toBeNull()
  })
})

// ─────────────────────────── the endpoint's behaviour ───────────────────────────

describeDb('what a stranger can learn', () => {
  it('answers a repeat address exactly as it answers a new one', async () => {
    // The oracle this rules out: if the second submission read differently, the
    // form would answer "has this company been talking to you" to anybody who
    // typed a competitor's address into it.
    const address = email('oracle')
    const first = await handleWaitlistSubmission({ email: address }, bucket('oracle-a'))
    const second = await handleWaitlistSubmission({ email: address }, bucket('oracle-b'))

    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    expect(await db.waitlistSignup.count({ where: { email: address } })).toBe(1)
  })

  it('says the same thing about a malformed address as about any other bad input', async () => {
    const outcome = await handleWaitlistSubmission({ email: 'not-an-address' }, bucket('bad'))
    expect(outcome).toEqual({ ok: false, status: 400, error: WAITLIST_MESSAGES.invalid })
  })

  it('accepts a submission that filled the honeypot, and writes nothing', async () => {
    const address = email('bot')
    const outcome = await handleWaitlistSubmission(
      { email: address, website: 'http://spam.example' },
      bucket('bot'),
    )
    expect(outcome).toEqual({ ok: true, status: 200 })
    expect(await rowFor(address)).toBeNull()
  })
})

// ─────────────────────────── the ceiling ───────────────────────────

describeDb('the ceiling on one address', () => {
  it(`admits exactly ${WAITLIST_IP_RULE.ceiling} in a window and then refuses`, async () => {
    const key = bucket('ceiling')
    const verdicts: boolean[] = []
    for (let i = 0; i < WAITLIST_IP_RULE.ceiling + 2; i += 1) {
      verdicts.push((await consumeWaitlistAttempt(key)).allowed)
    }
    expect(verdicts.filter(Boolean)).toHaveLength(WAITLIST_IP_RULE.ceiling)
    expect(verdicts.at(-1)).toBe(false)
  })

  it('is exact under genuinely concurrent submissions', async () => {
    // The reason this counter is a database row and not a variable: two
    // requests must not both read the same count and both decide they are under
    // the ceiling.
    const key = bucket('race')
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () => consumeWaitlistAttempt(key)),
    )
    expect(attempts.filter((a) => a.allowed)).toHaveLength(WAITLIST_IP_RULE.ceiling)
  })

  it('does not let one address spend the budget of another', async () => {
    const spent = bucket('flooder')
    for (let i = 0; i < WAITLIST_IP_RULE.ceiling; i += 1) await consumeWaitlistAttempt(spent)

    expect((await consumeWaitlistAttempt(spent)).allowed).toBe(false)
    expect((await consumeWaitlistAttempt(bucket('builder'))).allowed).toBe(true)
  })

  it('stops the endpoint, not just the counter', async () => {
    const key = bucket('endpoint')
    for (let i = 0; i < WAITLIST_IP_RULE.ceiling; i += 1) {
      await handleWaitlistSubmission({ email: email(`flood-${i}`) }, key)
    }
    const refused = await handleWaitlistSubmission({ email: email('flood-last') }, key)

    expect(refused.ok).toBe(false)
    expect(refused).toMatchObject({ status: 429, error: WAITLIST_MESSAGES.throttled })
    expect(await rowFor(email('flood-last'))).toBeNull()
  })

  it('counts a refused submission under the key the module owns', async () => {
    const key = bucket('keyed')
    await consumeWaitlistAttempt(key)
    const rows = await db.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "RateLimitCounter" WHERE "key" = ${waitlistRateKey(key)}
    `
    expect(rows).toHaveLength(1)
  })

  it('sweeps only its own spent rows, never the live rows of another feature', async () => {
    const key = bucket('sweep')
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    await consumeWaitlistAttempt(key, longAgo)
    await db.$executeRaw`
      INSERT INTO "RateLimitCounter" ("key", "windowStart", "count", "updatedAt")
      VALUES (${`login:ip:${bucket('sweep')}`}, ${longAgo}, 1, ${longAgo})
    `

    await sweepExpiredWaitlistRateCounters()

    const mine = await db.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "RateLimitCounter" WHERE "key" = ${waitlistRateKey(key)}
    `
    const theirs = await db.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "RateLimitCounter" WHERE "key" = ${`login:ip:${bucket('sweep')}`}
    `
    expect(mine).toHaveLength(0)
    expect(theirs).toHaveLength(1)
  })
})

// ─────────────────────────── who may read it ───────────────────────────

describe('who may read the list', () => {
  const original = process.env.WAITLIST_OPERATOR_EMAILS

  beforeEach(() => {
    delete process.env.WAITLIST_OPERATOR_EMAILS
  })

  afterAll(() => {
    if (original === undefined) delete process.env.WAITLIST_OPERATOR_EMAILS
    else process.env.WAITLIST_OPERATOR_EMAILS = original
  })

  it('admits nobody when the deployment named nobody', () => {
    // The failure this rules out: an unset variable falling back to something
    // permissive publishes every prospect's details to the first customer who
    // guesses the URL.
    expect(waitlistOperatorEmails()).toEqual([])
    expect(isWaitlistOperator('billy@proedu.me')).toBe(false)
  })

  it('admits a named address whatever case it arrives in', () => {
    process.env.WAITLIST_OPERATOR_EMAILS = ' Billy@ProEdu.me , second@example.test '
    expect(isWaitlistOperator('billy@proedu.me')).toBe(true)
    expect(isWaitlistOperator('SECOND@example.test')).toBe(true)
  })

  it('admits nobody else, and nobody anonymous', () => {
    process.env.WAITLIST_OPERATOR_EMAILS = 'billy@proedu.me'
    expect(isWaitlistOperator('customer@builder.test')).toBe(false)
    expect(isWaitlistOperator(null)).toBe(false)
    expect(isWaitlistOperator(undefined)).toBe(false)
    expect(isWaitlistOperator('')).toBe(false)
  })
})

// ─────────────────────────── the screen ───────────────────────────

describe('sort choices', () => {
  it('falls back to newest for anything it does not recognise', () => {
    expect(parseSignupSort(undefined)).toBe('newest')
    expect(parseSignupSort('nonsense')).toBe('newest')
    expect(parseSignupSort('team')).toBe('team')
  })
})

describeDb('reading the list', () => {
  beforeEach(async () => {
    await db.$executeRaw`DELETE FROM "WaitlistSignup" WHERE "email" LIKE ${`%${RUN}%`}`
  })

  it('orders by arrival, newest first, because that is the default question', async () => {
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({ email: email('old') }),
      new Date('2026-01-01T00:00:00Z'),
    )
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({ email: email('new') }),
      new Date('2026-06-01T00:00:00Z'),
    )

    const mine = (await listWaitlistSignups('newest')).filter((r) => r.email.includes(RUN))
    expect(mine.map((r) => r.email)).toEqual([email('new'), email('old')])

    const oldest = (await listWaitlistSignups('oldest')).filter((r) => r.email.includes(RUN))
    expect(oldest.map((r) => r.email)).toEqual([email('old'), email('new')])
  })

  it('puts the biggest team first and the unanswered ones last', async () => {
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({ email: email('small'), teamSize: 'just-me' }),
    )
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({ email: email('big'), teamSize: '16-plus' }),
    )
    await recordWaitlistSignup(
      waitlistSignupSchema.parse({ email: email('mid'), teamSize: '6-15' }),
    )
    await recordWaitlistSignup(waitlistSignupSchema.parse({ email: email('unknown') }))

    const mine = (await listWaitlistSignups('team')).filter((r) => r.email.includes(RUN))
    expect(mine.map((r) => r.email)).toEqual([
      email('big'),
      email('mid'),
      email('small'),
      email('unknown'),
    ])
  })

  it('marks somebody invited, and lets a mis-click be taken back', async () => {
    await recordWaitlistSignup(waitlistSignupSchema.parse({ email: email('invite') }))
    const row = await rowFor(email('invite'))

    await setWaitlistInvited(row!.id, true)
    expect((await rowFor(email('invite')))?.invitedAt).not.toBeNull()

    await setWaitlistInvited(row!.id, false)
    expect((await rowFor(email('invite')))?.invitedAt).toBeNull()
  })
})
