// @vitest-environment node
//
// The reason the login counter is a database row and not a variable is that two
// requests must not be able to read the same count and both decide they are
// under the ceiling. That property cannot be observed against a mock, so these
// tests hit the real local Postgres (`pnpm db:up`) and fire genuinely concurrent
// statements at it.
//
// Every key interpolates a run-scoped id, so parallel runs and incomplete
// teardown cannot collide.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  AUTH_RATE_RETENTION_MS,
  LOGIN_EMAIL_RULE,
  LOGIN_IP_EMAIL_RULE,
  LOGIN_IP_RULE,
  REGISTER_IP_RULE,
  clearLoginAttempts,
  consumeAuthCounter,
  consumeLoginAttempt,
  consumeRegisterAttempt,
  emailKeyHash,
  isLoginRateLimited,
  loginRateKeys,
  peekAuthCounter,
  sweepExpiredAuthRateCounters,
  windowStartFor,
  type AuthRateRule,
} from '@/modules/auth/rate-limit'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('auth rate-limit tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const describeDb = reachable ? describe : describe.skip

/** A bucket key nothing else in the suite, or in the app, will touch. */
function ipBucket(label: string): string {
  return `v4:test-${RUN}-${label}`
}

function emailFor(label: string): string {
  return `rl-${RUN}-${label}@example.test`
}

async function keysCreatedByThisRun(): Promise<Array<{ key: string; count: number }>> {
  return db.$queryRaw<Array<{ key: string; count: number }>>`
    SELECT "key", "count" FROM "RateLimitCounter" WHERE "key" LIKE ${'%test-' + RUN + '%'}
  `
}

async function deleteRunRows(): Promise<void> {
  await db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "key" LIKE ${'%test-' + RUN + '%'}`
}

afterAll(async () => {
  if (reachable) await deleteRunRows()
})

describeDb('consumeAuthCounter, the atomic primitive', () => {
  beforeEach(async () => {
    await deleteRunRows()
  })

  it('admits exactly the ceiling and refuses the next one', async () => {
    const rule: AuthRateRule = { ceiling: 3, windowMs: 60_000 }
    const key = `login:ip:${ipBucket('exact')}`
    const verdicts: boolean[] = []
    for (let i = 0; i < 5; i += 1) verdicts.push(await consumeAuthCounter(key, rule))
    expect(verdicts).toEqual([true, true, true, false, false])
  })

  it('does not increment on a refusal, so hammering cannot extend the window', async () => {
    const rule: AuthRateRule = { ceiling: 2, windowMs: 60_000 }
    const key = `login:ip:${ipBucket('no-extend')}`
    for (let i = 0; i < 10; i += 1) await consumeAuthCounter(key, rule)
    expect(await peekAuthCounter(key, rule)).toBe(2)
  })

  it('counts concurrent increments exactly, losing none of them', async () => {
    // The whole case for a database counter. Fifty callers arrive at once under
    // a ceiling none of them can reach; a read-then-write would lose updates and
    // land somewhere under fifty.
    const rule: AuthRateRule = { ceiling: 10_000, windowMs: 60_000 }
    const key = `login:ip:${ipBucket('lost-updates')}`
    const results = await Promise.all(
      Array.from({ length: 50 }, () => consumeAuthCounter(key, rule)),
    )
    expect(results.every(Boolean)).toBe(true)
    expect(await peekAuthCounter(key, rule)).toBe(50)
  })

  it('lets exactly the ceiling through when every request races the others', async () => {
    // Same race, but now the ceiling is inside the burst. Exactly ten may pass,
    // and the row must not overshoot: a read-then-write under this load hands
    // out extra grants AND leaves a count that disagrees with them.
    const rule: AuthRateRule = { ceiling: 10, windowMs: 60_000 }
    const key = `login:ip:${ipBucket('race-ceiling')}`
    const results = await Promise.all(
      Array.from({ length: 40 }, () => consumeAuthCounter(key, rule)),
    )
    expect(results.filter(Boolean)).toHaveLength(10)
    expect(await peekAuthCounter(key, rule)).toBe(10)
  })

  it('starts a fresh bucket in the next fixed window', async () => {
    const rule: AuthRateRule = { ceiling: 1, windowMs: 60_000 }
    const key = `login:ip:${ipBucket('rollover')}`
    const first = new Date('2026-08-27T10:00:30.000Z')
    const sameWindow = new Date('2026-08-27T10:00:59.000Z')
    const nextWindow = new Date('2026-08-27T10:01:00.000Z')

    expect(await consumeAuthCounter(key, rule, first)).toBe(true)
    expect(await consumeAuthCounter(key, rule, sameWindow)).toBe(false)
    expect(await consumeAuthCounter(key, rule, nextWindow)).toBe(true)
  })

  it('floors the window start to the window length', () => {
    expect(windowStartFor(new Date('2026-08-27T10:07:31.500Z'), 15 * 60_000).toISOString()).toBe(
      '2026-08-27T10:00:00.000Z',
    )
  })
})

describeDb('login keys', () => {
  it('never writes the email address into the table', async () => {
    await deleteRunRows()
    const email = emailFor('privacy')
    const bucket = ipBucket('privacy')
    await consumeLoginAttempt(bucket, email)
    const rows = await keysCreatedByThisRun()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.key).not.toContain(email)
      expect(row.key).not.toContain('@')
    }
  })

  it('folds case and surrounding space so one account is one bucket', () => {
    expect(emailKeyHash('  Builder@Example.Test ')).toBe(emailKeyHash('builder@example.test'))
    expect(emailKeyHash('a@example.test')).not.toBe(emailKeyHash('b@example.test'))
  })
})

describeDb('consumeLoginAttempt, the three ceilings', () => {
  beforeEach(async () => {
    await deleteRunRows()
  })

  it('stops guessing at one account from one address at the tight ceiling', async () => {
    const bucket = ipBucket('guess')
    const email = emailFor('guess')
    const verdicts: boolean[] = []
    for (let i = 0; i < LOGIN_IP_EMAIL_RULE.ceiling + 2; i += 1) {
      verdicts.push((await consumeLoginAttempt(bucket, email)).allowed)
    }
    expect(verdicts.filter(Boolean)).toHaveLength(LOGIN_IP_EMAIL_RULE.ceiling)

    const refused = await consumeLoginAttempt(bucket, email)
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.scope).toBe('ip+email')
  })

  it('leaves a different account at the same address alone until the IP ceiling', async () => {
    // The office-behind-one-NAT case. One colleague fumbling their password must
    // not sign the whole building out.
    const bucket = ipBucket('office')
    for (let i = 0; i < LOGIN_IP_EMAIL_RULE.ceiling; i += 1) {
      await consumeLoginAttempt(bucket, emailFor('office-a'))
    }
    expect((await consumeLoginAttempt(bucket, emailFor('office-a'))).allowed).toBe(false)
    expect((await consumeLoginAttempt(bucket, emailFor('office-b'))).allowed).toBe(true)
  })

  it('stops credential stuffing that never repeats an email, on the IP ceiling', async () => {
    const bucket = ipBucket('stuffing')
    const verdicts: boolean[] = []
    for (let i = 0; i < LOGIN_IP_RULE.ceiling + 3; i += 1) {
      verdicts.push((await consumeLoginAttempt(bucket, emailFor(`stuff-${i}`))).allowed)
    }
    expect(verdicts.filter(Boolean)).toHaveLength(LOGIN_IP_RULE.ceiling)

    const refused = await consumeLoginAttempt(bucket, emailFor('stuff-late'))
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.scope).toBe('ip')
  })

  it('stops a distributed run against one account on the account-wide ceiling', async () => {
    const email = emailFor('botnet')
    for (let i = 0; i < LOGIN_EMAIL_RULE.ceiling; i += 1) {
      // A fresh address every time: no per-address ceiling ever sees a second
      // attempt, which is exactly how a botnet spends a password list.
      const verdict = await consumeLoginAttempt(ipBucket(`bot-${i}`), email)
      expect(verdict.allowed).toBe(true)
    }
    const refused = await consumeLoginAttempt(ipBucket('bot-last'), email)
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.scope).toBe('email')
  })

  it('does not let an address that is already refused push a victim’s account counter', async () => {
    const bucket = ipBucket('shortcircuit')
    const email = emailFor('victim')
    for (let i = 0; i < LOGIN_IP_RULE.ceiling; i += 1) {
      await consumeLoginAttempt(bucket, emailFor(`filler-${i}`))
    }
    const before = await peekAuthCounter(loginRateKeys(bucket, email).email, LOGIN_EMAIL_RULE)
    for (let i = 0; i < 10; i += 1) await consumeLoginAttempt(bucket, email)
    const after = await peekAuthCounter(loginRateKeys(bucket, email).email, LOGIN_EMAIL_RULE)
    expect(after).toBe(before)
  })
})

describeDb('a correct password clears what the failures cost', () => {
  beforeEach(async () => {
    await deleteRunRows()
  })

  it('drops both account buckets and hands the address bucket its unit back', async () => {
    const bucket = ipBucket('success')
    const email = emailFor('success')
    const keys = loginRateKeys(bucket, email)
    const now = new Date()

    for (let i = 0; i < 4; i += 1) await consumeLoginAttempt(bucket, email, now)
    expect(await peekAuthCounter(keys.ipEmail, LOGIN_IP_EMAIL_RULE, now)).toBe(4)
    expect(await peekAuthCounter(keys.ip, LOGIN_IP_RULE, now)).toBe(4)

    await clearLoginAttempts(bucket, email, now)

    expect(await peekAuthCounter(keys.ipEmail, LOGIN_IP_EMAIL_RULE, now)).toBe(0)
    expect(await peekAuthCounter(keys.email, LOGIN_EMAIL_RULE, now)).toBe(0)
    // Refunded, not cleared: the other three failures were against other
    // accounts as far as this bucket knows, and are not this user's to erase.
    expect(await peekAuthCounter(keys.ip, LOGIN_IP_RULE, now)).toBe(3)
  })

  it('never drives a bucket negative', async () => {
    const bucket = ipBucket('negative')
    const email = emailFor('negative')
    const now = new Date()
    await clearLoginAttempts(bucket, email, now)
    await clearLoginAttempts(bucket, email, now)
    expect(await peekAuthCounter(loginRateKeys(bucket, email).ip, LOGIN_IP_RULE, now)).toBe(0)
  })

  it('lets a builder who fumbled four times and got in keep trying tomorrow', async () => {
    const bucket = ipBucket('fumble')
    const email = emailFor('fumble')
    const now = new Date()
    for (let i = 0; i < LOGIN_IP_EMAIL_RULE.ceiling - 1; i += 1) {
      await consumeLoginAttempt(bucket, email, now)
    }
    await clearLoginAttempts(bucket, email, now)
    for (let i = 0; i < LOGIN_IP_EMAIL_RULE.ceiling; i += 1) {
      expect((await consumeLoginAttempt(bucket, email, now)).allowed).toBe(true)
    }
  })
})

describeDb('isLoginRateLimited, the copy decision', () => {
  beforeEach(async () => {
    await deleteRunRows()
  })

  it('is false while attempts remain and true once a ceiling is reached', async () => {
    const bucket = ipBucket('peek')
    const email = emailFor('peek')
    expect(await isLoginRateLimited(bucket, email)).toBe(false)
    for (let i = 0; i < LOGIN_IP_EMAIL_RULE.ceiling - 1; i += 1) {
      await consumeLoginAttempt(bucket, email)
    }
    expect(await isLoginRateLimited(bucket, email)).toBe(false)
    await consumeLoginAttempt(bucket, email)
    expect(await isLoginRateLimited(bucket, email)).toBe(true)
  })
})

describeDb('registration', () => {
  beforeEach(async () => {
    await deleteRunRows()
  })

  it('caps account creation per address, counting successes too', async () => {
    const bucket = ipBucket('signup')
    const verdicts: boolean[] = []
    for (let i = 0; i < REGISTER_IP_RULE.ceiling + 2; i += 1) {
      verdicts.push((await consumeRegisterAttempt(bucket)).allowed)
    }
    expect(verdicts.filter(Boolean)).toHaveLength(REGISTER_IP_RULE.ceiling)
  })

  it('counts on a key of its own, so signups and sign-ins do not spend each other', async () => {
    const bucket = ipBucket('separate')
    for (let i = 0; i < REGISTER_IP_RULE.ceiling; i += 1) await consumeRegisterAttempt(bucket)
    expect((await consumeRegisterAttempt(bucket)).allowed).toBe(false)
    expect((await consumeLoginAttempt(bucket, emailFor('separate'))).allowed).toBe(true)
  })
})

describeDb('sweeping', () => {
  it('drops rows whose window closed long ago and keeps live ones', async () => {
    await deleteRunRows()
    const now = new Date()
    const old = new Date(now.getTime() - LOGIN_EMAIL_RULE.windowMs - AUTH_RATE_RETENTION_MS - 60_000)
    const staleKey = `login:ip:${ipBucket('stale')}`
    const liveKey = `login:ip:${ipBucket('live')}`
    await consumeAuthCounter(staleKey, LOGIN_IP_RULE, old)
    await consumeAuthCounter(liveKey, LOGIN_IP_RULE, now)

    await sweepExpiredAuthRateCounters(now)

    expect(await peekAuthCounter(staleKey, LOGIN_IP_RULE, old)).toBe(0)
    expect(await peekAuthCounter(liveKey, LOGIN_IP_RULE, now)).toBe(1)
  })

  it('leaves keys it does not own alone, whatever their age', async () => {
    // `RateLimitCounter` is a shared table. Another feature's window is not this
    // module's to reason about, so an unscoped age sweep would delete live rows.
    const now = new Date()
    const old = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000)
    const foreignKey = `someoneelse:test-${RUN}:keep-me`
    await consumeAuthCounter(foreignKey, LOGIN_IP_RULE, old)
    await sweepExpiredAuthRateCounters(now)
    expect(await peekAuthCounter(foreignKey, LOGIN_IP_RULE, old)).toBe(1)
    await deleteRunRows()
  })
})
