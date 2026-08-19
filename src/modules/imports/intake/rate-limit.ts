// Atomic, cross-instance rate limiting for the public intake route.
//
// An in-memory token bucket is per-process. N instances of the app each hold
// their own bucket, so a limit of 20 becomes a limit of 20N and the ceiling
// silently stops meaning anything the moment the service scales past one
// instance. The counter therefore lives in Postgres and every check is a single
// statement:
//
//   INSERT ... VALUES (..., 1, ...)
//   ON CONFLICT (scope, bucketKey, windowStart)
//   DO UPDATE SET count = count + 1
//   WHERE IntakeRateCounter.count < $ceiling
//
// Postgres evaluates the whole statement under the unique index, so concurrent
// callers serialise on the conflicting row rather than racing a read-then-write.
// The number of rows affected is the verdict: 1 means the request was inside
// the ceiling (either it created the bucket or it incremented a live one), and
// 0 means the DO UPDATE predicate was false, which happens only when the bucket
// is already at the ceiling. No SELECT, no transaction, no retry loop.
//
// Windows are fixed, not sliding: `windowStart` is the request time floored to
// the window length, so a new row appears once per window and old rows age out.

import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import {
  INTAKE_RATE_LIMIT_PER_IP,
  INTAKE_RATE_LIMIT_PER_TOKEN,
  INTAKE_RATE_RETENTION_MS,
  INTAKE_RATE_WINDOW_MS,
} from './constants'

export type RateLimitScope = 'ip' | 'token'

export interface RateLimitDecision {
  allowed: boolean
  scope: RateLimitScope
  /** Seconds until the current window rolls over. Drives `Retry-After`. */
  retryAfterSeconds: number
}

export function windowStartFor(at: Date, windowMs: number = INTAKE_RATE_WINDOW_MS): Date {
  return new Date(Math.floor(at.getTime() / windowMs) * windowMs)
}

function retryAfterSeconds(at: Date, windowMs: number): number {
  const elapsed = at.getTime() - windowStartFor(at, windowMs).getTime()
  return Math.max(1, Math.ceil((windowMs - elapsed) / 1000))
}

export interface ConsumeOptions {
  scope: RateLimitScope
  /** Already normalized by the caller (IPv6 reduced to its /64 prefix). */
  bucketKey: string
  ceiling: number
  now?: Date
  windowMs?: number
}

/**
 * Consume one unit from a bucket. Returns false when the bucket is spent.
 *
 * A ceiling of N admits exactly N requests per window: the insert lands with
 * count = 1, each later request updates while count < N, and the (N+1)th finds
 * count = N, fails the predicate, and affects zero rows.
 */
export async function consumeRateLimit(options: ConsumeOptions): Promise<RateLimitDecision> {
  const now = options.now ?? new Date()
  const windowMs = options.windowMs ?? INTAKE_RATE_WINDOW_MS
  const ceiling = Math.max(1, Math.trunc(options.ceiling))
  const start = windowStartFor(now, windowMs)
  const expiresAt = new Date(start.getTime() + windowMs + INTAKE_RATE_RETENTION_MS)
  const id = `irc_${start.getTime().toString(36)}_${cryptoRandomSuffix()}`

  const affected = await db.$executeRaw(Prisma.sql`
    INSERT INTO "IntakeRateCounter"
      ("id", "scope", "bucketKey", "windowStart", "count", "expiresAt", "createdAt")
    VALUES (${id}, ${options.scope}, ${options.bucketKey}, ${start}, 1, ${expiresAt}, ${now})
    ON CONFLICT ("scope", "bucketKey", "windowStart")
    DO UPDATE SET "count" = "IntakeRateCounter"."count" + 1
    WHERE "IntakeRateCounter"."count" < ${ceiling}
  `)

  return {
    allowed: affected === 1,
    scope: options.scope,
    retryAfterSeconds: retryAfterSeconds(now, windowMs),
  }
}

function cryptoRandomSuffix(): string {
  // Only ever used for a row that may immediately lose to a unique-index
  // conflict, so collision resistance matters far less than not blocking.
  return Math.random().toString(36).slice(2, 10)
}

/**
 * The network-prefix ceiling. Consumed before the token is even looked up, so
 * a caller enumerating tokens is stopped without their traffic reaching the
 * database and without garbage tokens creating counter rows.
 */
export async function consumeIpBudget(
  ipBucket: string,
  now?: Date,
  windowMs?: number,
): Promise<RateLimitDecision> {
  const options: ConsumeOptions = {
    scope: 'ip',
    bucketKey: ipBucket,
    ceiling: INTAKE_RATE_LIMIT_PER_IP,
  }
  if (now !== undefined) options.now = now
  if (windowMs !== undefined) options.windowMs = windowMs
  return consumeRateLimit(options)
}

/**
 * The per-link ceiling, so one leaked link cannot be used as an upload firehose
 * from a botnet whose addresses each have their own IP budget.
 *
 * Keyed on the link's id, never on the token itself. Writing live tokens into a
 * second table would turn the rate-limit rows into a list of working capability
 * URLs, and it would let an attacker grow the table with tokens that do not
 * exist. Only a resolved link reaches this function.
 */
export async function consumeLinkBudget(
  linkId: string,
  now?: Date,
  windowMs?: number,
): Promise<RateLimitDecision> {
  const options: ConsumeOptions = {
    scope: 'token',
    bucketKey: linkId,
    ceiling: INTAKE_RATE_LIMIT_PER_TOKEN,
  }
  if (now !== undefined) options.now = now
  if (windowMs !== undefined) options.windowMs = windowMs
  return consumeRateLimit(options)
}

/** Drop counter rows whose retention window has passed. */
export async function sweepExpiredRateCounters(now: Date = new Date()): Promise<number> {
  const result = await db.intakeRateCounter.deleteMany({ where: { expiresAt: { lt: now } } })
  return result.count
}
