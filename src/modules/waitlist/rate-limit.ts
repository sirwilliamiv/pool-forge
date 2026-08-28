// Throttling for the public signup form.
//
// This deliberately adds no new counter. `RateLimitCounter` already holds an
// atomic, cross-instance bucket, and `consumeAuthCounter` already implements
// the one statement that makes it correct under concurrency:
//
//   INSERT ... ON CONFLICT ("key","windowStart")
//   DO UPDATE SET count = count + 1 WHERE count < $ceiling
//
// The reasoning behind that shape is written out at length in
// `@/modules/auth/rate-limit` and in `@/modules/imports/intake/rate-limit`, and
// repeating it here as a third copy is how three implementations drift into
// disagreeing about what a window is. This module contributes exactly what is
// specific to the waitlist: its own key prefix, its own ceiling, and its own
// sweep.
//
// ONE BUCKET, NOT TWO
//
// There is no global "signups per hour across everybody" ceiling, and that is a
// choice rather than an omission. A global ceiling is a lever an attacker can
// pull on purpose: spend it from a botnet and every genuine builder who arrives
// for the rest of the window is turned away from the only page that lets them
// in. Per-address is the bucket that costs the flooder something, and the worst
// a flood can do without it is add rows to a table the owner reads by hand.

import {
  AUTH_RATE_RETENTION_MS,
  consumeAuthCounter,
  windowStartFor,
  type AuthRateRule,
} from '@/modules/auth/rate-limit'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

const MINUTE = 60 * 1000

/**
 * Signups accepted from one address (IPv4, or IPv6 folded to its /64) per hour.
 *
 * Five is the same ceiling account creation uses. A builder signs up once; the
 * only caller that needs a sixth in an hour is a script. It is high enough that
 * an office behind one NAT can put its owner, its estimator and a couple of
 * salespeople on the list in one sitting.
 *
 * Accepted submissions count as well as refused ones. A refund on success would
 * make "send valid signups" the way to keep the bucket empty, which is exactly
 * what a flooder does.
 */
export const WAITLIST_IP_RULE: AuthRateRule = { ceiling: 5, windowMs: 60 * MINUTE }

export function waitlistRateKey(ipBucket: string): string {
  return `waitlist:ip:${ipBucket}`
}

export interface WaitlistGateResult {
  readonly allowed: boolean
  /** Seconds until the window rolls over. Drives `Retry-After`. */
  readonly retryAfterSeconds: number
}

function retryAfterSeconds(at: Date, windowMs: number): number {
  const elapsed = at.getTime() - windowStartFor(at, windowMs).getTime()
  return Math.max(1, Math.ceil((windowMs - elapsed) / 1000))
}

/** Spend one unit for this address. False means the address is done for the window. */
export async function consumeWaitlistAttempt(
  ipBucket: string,
  now: Date = new Date(),
): Promise<WaitlistGateResult> {
  const allowed = await consumeAuthCounter(waitlistRateKey(ipBucket), WAITLIST_IP_RULE, now)
  return { allowed, retryAfterSeconds: retryAfterSeconds(now, WAITLIST_IP_RULE.windowMs) }
}

/**
 * Drop spent rows this module owns.
 *
 * Scoped to the `waitlist:` prefix for the same reason the auth sweep is scoped
 * to its own: `RateLimitCounter` is a shared table, and a bare `windowStart <`
 * delete would take live buckets belonging to a feature with a longer window.
 * The auth module's sweep matches `login:%` and `register:%` and so will never
 * reach these rows, which is why this exists rather than being folded in there.
 */
export async function sweepExpiredWaitlistRateCounters(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WAITLIST_IP_RULE.windowMs - AUTH_RATE_RETENTION_MS)
  return db.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitCounter"
    WHERE "windowStart" < ${cutoff} AND "key" LIKE 'waitlist:%'
  `)
}
