// Throttling for the credential endpoints.
//
// WHY THE COUNTER IS IN POSTGRES
//
// An in-memory bucket is per process. N instances of the app each hold their
// own, so a ceiling of 20 becomes 20N and stops meaning anything the moment the
// service scales past one instance. Worse, a Next dev/prod server recycles
// workers, so even one instance forgets. The counter therefore lives in the
// `RateLimitCounter` table and every check is a single statement:
//
//   INSERT ... VALUES (key, windowStart, 1, now)
//   ON CONFLICT ("key","windowStart")
//   DO UPDATE SET count = count + 1
//   WHERE "RateLimitCounter"."count" < $ceiling
//
// Postgres evaluates that whole statement under the primary-key index, so two
// racing requests serialise on the conflicting row instead of both reading the
// same count and both deciding they are allowed. The number of rows affected is
// the verdict: 1 means inside the ceiling, 0 means the DO UPDATE predicate was
// false, which happens only when the bucket is already spent. No SELECT, no
// transaction, no retry loop, and no read-modify-write anywhere in the path.
//
// This is the same shape as `imports/intake/rate-limit.ts`, deliberately: one
// idiom for one problem. It is a separate module because it counts on a
// different table with a different key shape, and because the intake module is
// owned elsewhere.
//
// WHAT IS COUNTED, AND WHY THREE BUCKETS
//
//   login:ip        Every failed attempt from one IPv4 address or IPv6 /64.
//                   This is the bucket that costs a credential-stuffing run:
//                   stuffing tries thousands of DIFFERENT emails once each, so
//                   no per-email counter ever sees it twice.
//
//   login:ip+email  Failed attempts against one account from one address. Tight,
//                   because a human who mistyped their own password does not
//                   need six tries, and this is the bucket that stops password
//                   guessing against a single known email.
//
//   login:email     Failed attempts against one account from ANY address, over a
//                   longer window. The only thing that sees a botnet spending
//                   four guesses per address against one high-value account.
//
// The per-email ceiling is deliberately high and the window deliberately short,
// because a per-email counter is a denial-of-service weapon pointed at a named
// user: anyone who knows a builder's email can spend that budget on purpose. A
// low ceiling would mean five wrong guesses locks a real person out of their own
// business. So: no lockout, no admin unlock, no escalating backoff, nothing that
// persists past the window. An attacker who wants to keep one builder out has to
// sustain 50 failures an hour forever, which their own per-IP budgets make
// expensive, and the moment they stop, the window rolls and the user is fine.
//
// Successes are not counted. A failed attempt consumes; a correct password
// refunds the IP bucket and deletes the two email-keyed buckets outright (see
// `clearLoginAttempts`). Without that refund an office of thirty builders behind
// one NAT would spend the shared IP budget every morning just by signing in.
// The accepted cost is that an attacker who holds one valid account of their own
// can interleave successful logins to keep their IP bucket drained; they still
// pay a full round trip and a bcrypt verify per refund, and it buys them nothing
// against the per-(ip,email) and per-email ceilings, which only clear for the
// one account they proved they own.
//
// Keys hash the email rather than storing it. The table would otherwise become a
// side list of addresses that have tried to sign in, readable by anything with
// SELECT on it, and it is not needed: the counter never has to be read back by
// address.

import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'

/** One ceiling, over one fixed window. */
export interface AuthRateRule {
  readonly ceiling: number
  readonly windowMs: number
}

const MINUTE = 60 * 1000

/** Failed sign-ins from one address (IPv4, or IPv6 folded to its /64). */
export const LOGIN_IP_RULE: AuthRateRule = { ceiling: 20, windowMs: 15 * MINUTE }

/** Failed sign-ins against one account from one address. */
export const LOGIN_IP_EMAIL_RULE: AuthRateRule = { ceiling: 5, windowMs: 15 * MINUTE }

/** Failed sign-ins against one account from everywhere at once. */
export const LOGIN_EMAIL_RULE: AuthRateRule = { ceiling: 50, windowMs: 60 * MINUTE }

/**
 * Account creations attempted from one address. Registration answers "is this
 * email already taken", which is an enumeration oracle whatever the wording, and
 * it writes a User, an Organization, and a membership per call. Both reasons
 * want the same modest ceiling.
 */
export const REGISTER_IP_RULE: AuthRateRule = { ceiling: 5, windowMs: 60 * MINUTE }

/**
 * Password-reset requests from one address.
 *
 * Each one either sends mail or asks Identity Platform to send mail, so the
 * ceiling is a spend limit on somebody else's outbound reputation as well as a
 * limit on probing. Higher than the per-address ceiling below because an office
 * behind one NAT is a real thing.
 */
export const RESET_REQUEST_IP_RULE: AuthRateRule = { ceiling: 10, windowMs: 60 * MINUTE }

/**
 * Password-reset requests naming one address, from anywhere.
 *
 * This is the mail-bomb ceiling: without it, anyone who knows a builder's email
 * can put a hundred reset links in their inbox, which is both harassment and a
 * good way to get the sending domain listed as spam. Deliberately generous
 * enough that a person who clicks the button twice, gets impatient and clicks it
 * again is never refused.
 */
export const RESET_REQUEST_EMAIL_RULE: AuthRateRule = { ceiling: 5, windowMs: 60 * MINUTE }

/**
 * Attempts to redeem a one-time link from one address: invite acceptance and
 * reset completion together.
 *
 * The token itself is 256 bits and is not going to be guessed. What this ceiling
 * actually buys is a limit on the work a stranger can make the server do per
 * attempt, which is now a database transaction plus a round trip to an identity
 * service, and a limit on somebody walking a list of harvested links.
 *
 * Note the deliberate asymmetry with sign-in: accepting an invite for an address
 * that ALREADY has an account checks that account's password, and that check
 * spends the ordinary login buckets as well, because it is a password guess
 * whatever page it happens on.
 */
export const TOKEN_ATTEMPT_IP_RULE: AuthRateRule = { ceiling: 20, windowMs: 15 * MINUTE }

/** How long a spent row is kept before `sweepExpiredAuthRateCounters` may drop it. */
export const AUTH_RATE_RETENTION_MS = 24 * 60 * MINUTE

/** Which ceiling refused an attempt. Never shown to the caller; for logs and tests. */
export type LoginRateScope = 'ip' | 'ip+email' | 'email'

export type LoginGateResult =
  | { allowed: true }
  | { allowed: false; scope: LoginRateScope; retryAfterSeconds: number }

export function windowStartFor(at: Date, windowMs: number): Date {
  return new Date(Math.floor(at.getTime() / windowMs) * windowMs)
}

function retryAfterSeconds(at: Date, windowMs: number): number {
  const elapsed = at.getTime() - windowStartFor(at, windowMs).getTime()
  return Math.max(1, Math.ceil((windowMs - elapsed) / 1000))
}

/**
 * Stable, non-reversing handle for an email address.
 *
 * Truncated to 32 hex characters: 128 bits, so a collision that merged two
 * builders' counters is not a thing that happens, while the key stays short
 * enough to index comfortably.
 */
export function emailKeyHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export interface LoginRateKeys {
  readonly ip: string
  readonly ipEmail: string
  readonly email: string
}

export function loginRateKeys(ipBucket: string, email: string): LoginRateKeys {
  const hash = emailKeyHash(email)
  return {
    ip: `login:ip:${ipBucket}`,
    ipEmail: `login:ip+email:${ipBucket}:${hash}`,
    email: `login:email:${hash}`,
  }
}

export function registerRateKey(ipBucket: string): string {
  return `register:ip:${ipBucket}`
}

export interface ResetRateKeys {
  readonly ip: string
  readonly email: string
}

export function resetRequestRateKeys(ipBucket: string, email: string): ResetRateKeys {
  return {
    ip: `reset:ip:${ipBucket}`,
    email: `reset:email:${emailKeyHash(email)}`,
  }
}

export function tokenAttemptRateKey(ipBucket: string): string {
  return `token:ip:${ipBucket}`
}

/**
 * Spend one unit from a bucket. Returns false when the bucket is already at its
 * ceiling.
 *
 * A ceiling of N admits exactly N per window: the insert lands with count = 1,
 * every later attempt updates while count < N, and the (N+1)th finds count = N,
 * fails the predicate, and affects zero rows. A refused attempt does not
 * increment, so a caller hammering a spent bucket cannot push its own window out.
 */
export async function consumeAuthCounter(
  key: string,
  rule: AuthRateRule,
  now: Date = new Date(),
): Promise<boolean> {
  const ceiling = Math.max(1, Math.trunc(rule.ceiling))
  const start = windowStartFor(now, rule.windowMs)

  const affected = await db.$executeRaw(Prisma.sql`
    INSERT INTO "RateLimitCounter" ("key", "windowStart", "count", "updatedAt")
    VALUES (${key}, ${start}, 1, ${now})
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimitCounter"."count" + 1, "updatedAt" = ${now}
    WHERE "RateLimitCounter"."count" < ${ceiling}
  `)
  return affected === 1
}

/** Hand one unit back. Used when an attempt turns out to have been legitimate. */
async function refundAuthCounter(key: string, rule: AuthRateRule, now: Date): Promise<void> {
  const start = windowStartFor(now, rule.windowMs)
  await db.$executeRaw(Prisma.sql`
    UPDATE "RateLimitCounter"
    SET "count" = "count" - 1, "updatedAt" = ${now}
    WHERE "key" = ${key} AND "windowStart" = ${start} AND "count" > 0
  `)
}

/** Current count for a key in the window covering `now`. Zero when no row exists. */
export async function peekAuthCounter(
  key: string,
  rule: AuthRateRule,
  now: Date = new Date(),
): Promise<number> {
  const start = windowStartFor(now, rule.windowMs)
  const rows = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT "count" FROM "RateLimitCounter"
    WHERE "key" = ${key} AND "windowStart" = ${start}
  `)
  return rows[0]?.count ?? 0
}

/**
 * Gate one sign-in attempt, spending from all three buckets.
 *
 * Ordered cheapest-to-defend first and short-circuited on the first refusal, so
 * a caller who has already exhausted their address does not get to keep pushing
 * a victim's account-wide counter up on the way past.
 */
export async function consumeLoginAttempt(
  ipBucket: string,
  email: string,
  now: Date = new Date(),
): Promise<LoginGateResult> {
  const keys = loginRateKeys(ipBucket, email)

  const checks: ReadonlyArray<{ key: string; rule: AuthRateRule; scope: LoginRateScope }> = [
    { key: keys.ip, rule: LOGIN_IP_RULE, scope: 'ip' },
    { key: keys.ipEmail, rule: LOGIN_IP_EMAIL_RULE, scope: 'ip+email' },
    { key: keys.email, rule: LOGIN_EMAIL_RULE, scope: 'email' },
  ]

  for (const check of checks) {
    const ok = await consumeAuthCounter(check.key, check.rule, now)
    if (!ok) {
      return {
        allowed: false,
        scope: check.scope,
        retryAfterSeconds: retryAfterSeconds(now, check.rule.windowMs),
      }
    }
  }
  return { allowed: true }
}

/**
 * Called after a correct password. Refunds the address bucket for this attempt
 * and drops both email-keyed buckets entirely, in every window, so a builder who
 * fumbled their password four times and then got it right starts clean rather
 * than carrying four strikes for the rest of the window.
 *
 * The address bucket is refunded, not cleared: other accounts' failures from the
 * same address are somebody else's evidence and are not this user's to erase.
 */
export async function clearLoginAttempts(
  ipBucket: string,
  email: string,
  now: Date = new Date(),
): Promise<void> {
  const keys = loginRateKeys(ipBucket, email)
  await refundAuthCounter(keys.ip, LOGIN_IP_RULE, now)
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitCounter" WHERE "key" IN (${keys.ipEmail}, ${keys.email})
  `)
}

/**
 * Read-only: is the next attempt from this address, against this account, going
 * to be refused?
 *
 * Used only to choose which sentence the sign-in form shows. It is a SELECT and
 * therefore racy by nature, which is fine: enforcement is the atomic consume in
 * `consumeLoginAttempt`, and the worst case here is a message that is one
 * attempt out of date.
 */
export async function isLoginRateLimited(
  ipBucket: string,
  email: string,
  now: Date = new Date(),
): Promise<boolean> {
  const keys = loginRateKeys(ipBucket, email)
  const [ip, ipEmail, emailCount] = await Promise.all([
    peekAuthCounter(keys.ip, LOGIN_IP_RULE, now),
    peekAuthCounter(keys.ipEmail, LOGIN_IP_EMAIL_RULE, now),
    peekAuthCounter(keys.email, LOGIN_EMAIL_RULE, now),
  ])
  return (
    ip >= LOGIN_IP_RULE.ceiling ||
    ipEmail >= LOGIN_IP_EMAIL_RULE.ceiling ||
    emailCount >= LOGIN_EMAIL_RULE.ceiling
  )
}

/** Gate one account-creation attempt. Successes count too: see `REGISTER_IP_RULE`. */
export async function consumeRegisterAttempt(
  ipBucket: string,
  now: Date = new Date(),
): Promise<LoginGateResult> {
  const ok = await consumeAuthCounter(registerRateKey(ipBucket), REGISTER_IP_RULE, now)
  if (ok) return { allowed: true }
  return {
    allowed: false,
    scope: 'ip',
    retryAfterSeconds: retryAfterSeconds(now, REGISTER_IP_RULE.windowMs),
  }
}

/**
 * Gate one password-reset request.
 *
 * Both buckets are spent whatever the outcome, and crucially BEFORE anything
 * looks the address up. Spending only when the account exists would make the
 * limiter itself the enumeration oracle the neutral response is there to
 * prevent: unknown addresses would stay cheap forever while real ones started
 * refusing, and a stopwatch would read the difference.
 */
export async function consumeResetRequest(
  ipBucket: string,
  email: string,
  now: Date = new Date(),
): Promise<LoginGateResult> {
  const keys = resetRequestRateKeys(ipBucket, email)
  const checks: ReadonlyArray<{ key: string; rule: AuthRateRule; scope: LoginRateScope }> = [
    { key: keys.ip, rule: RESET_REQUEST_IP_RULE, scope: 'ip' },
    { key: keys.email, rule: RESET_REQUEST_EMAIL_RULE, scope: 'email' },
  ]
  for (const check of checks) {
    const ok = await consumeAuthCounter(check.key, check.rule, now)
    if (!ok) {
      return {
        allowed: false,
        scope: check.scope,
        retryAfterSeconds: retryAfterSeconds(now, check.rule.windowMs),
      }
    }
  }
  return { allowed: true }
}

/**
 * Gate one attempt to redeem a one-time link, whichever kind.
 *
 * Keyed on the address only. A per-token counter would be pointless (a token
 * gets one use by construction) and a per-email counter would leak: the email is
 * inside the token, so counting by it would mean an unknown token could be told
 * apart from a known one by whether a bucket moved.
 */
export async function consumeTokenAttempt(
  ipBucket: string,
  now: Date = new Date(),
): Promise<LoginGateResult> {
  const ok = await consumeAuthCounter(tokenAttemptRateKey(ipBucket), TOKEN_ATTEMPT_IP_RULE, now)
  if (ok) return { allowed: true }
  return {
    allowed: false,
    scope: 'ip',
    retryAfterSeconds: retryAfterSeconds(now, TOKEN_ATTEMPT_IP_RULE.windowMs),
  }
}

/**
 * Drop rows whose window closed long enough ago that nothing will read them
 * again. Nothing schedules this yet; it exists so the table has a defined way to
 * stop growing, and it is safe to call from any future sweep job.
 */
export async function sweepExpiredAuthRateCounters(now: Date = new Date()): Promise<number> {
  const longestWindowMs = Math.max(
    LOGIN_IP_RULE.windowMs,
    LOGIN_IP_EMAIL_RULE.windowMs,
    LOGIN_EMAIL_RULE.windowMs,
    REGISTER_IP_RULE.windowMs,
    RESET_REQUEST_IP_RULE.windowMs,
    RESET_REQUEST_EMAIL_RULE.windowMs,
    TOKEN_ATTEMPT_IP_RULE.windowMs,
  )
  const cutoff = new Date(now.getTime() - longestWindowMs - AUTH_RATE_RETENTION_MS)
  // Scoped to the keys this module owns. `RateLimitCounter` is a general table
  // and another feature's rows may be counted over a window this one knows
  // nothing about, so a bare `windowStart <` sweep would delete live buckets.
  return db.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitCounter"
    WHERE "windowStart" < ${cutoff}
      AND (
        "key" LIKE 'login:%'
        OR "key" LIKE 'register:%'
        OR "key" LIKE 'reset:%'
        OR "key" LIKE 'token:%'
      )
  `)
}
