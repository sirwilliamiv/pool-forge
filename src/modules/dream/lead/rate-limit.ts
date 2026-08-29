// Throttling for the studio's one write.
//
// No new counter, for the reason written out at length in
// `waitlist/rate-limit.ts`: `RateLimitCounter` already holds an atomic,
// cross-instance bucket and `consumeAuthCounter` already implements the one
// statement that is correct under concurrency. What this module contributes is
// its own prefix, its own ceiling and its own sweep.
//
// Per address only. A global ceiling would be a lever an attacker could pull on
// purpose: spend it from a botnet and every genuine homeowner who arrives for
// the rest of the window is turned away from a page whose whole job is to
// collect them.

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
 * Designs saved from one address (IPv4, or IPv6 folded to its /64) per hour.
 *
 * Higher than the waitlist's five, because the behaviour being allowed for is
 * different. Building a second pool and sending that one too is the thing this
 * page is for: a couple deciding between a compact pool and a family one will
 * legitimately save three or four designs in a sitting, and a household behind
 * one address may have two people doing it. Ten leaves room for that and still
 * costs a script something.
 */
export const DREAM_LEAD_IP_RULE: AuthRateRule = { ceiling: 10, windowMs: 60 * MINUTE }

export function dreamLeadRateKey(ipBucket: string): string {
  return `dream:ip:${ipBucket}`
}

export interface DreamGateResult {
  readonly allowed: boolean
  /** Seconds until the window rolls over. Drives `Retry-After`. */
  readonly retryAfterSeconds: number
}

function retryAfterSeconds(at: Date, windowMs: number): number {
  const elapsed = at.getTime() - windowStartFor(at, windowMs).getTime()
  return Math.max(1, Math.ceil((windowMs - elapsed) / 1000))
}

/** Spend one unit for this address. False means the address is done for the window. */
export async function consumeDreamLeadAttempt(
  ipBucket: string,
  now: Date = new Date(),
): Promise<DreamGateResult> {
  const allowed = await consumeAuthCounter(dreamLeadRateKey(ipBucket), DREAM_LEAD_IP_RULE, now)
  return { allowed, retryAfterSeconds: retryAfterSeconds(now, DREAM_LEAD_IP_RULE.windowMs) }
}

/**
 * Drop spent rows this module owns.
 *
 * Scoped to the `dream:` prefix. `RateLimitCounter` is a shared table and a
 * bare `windowStart <` delete would take live buckets belonging to a feature
 * with a longer window.
 */
export async function sweepExpiredDreamRateCounters(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - DREAM_LEAD_IP_RULE.windowMs - AUTH_RATE_RETENTION_MS)
  return db.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitCounter"
    WHERE "windowStart" < ${cutoff} AND "key" LIKE 'dream:%'
  `)
}
