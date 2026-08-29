import { randomUUID } from 'node:crypto'

import { db } from '@/lib/db'

// What a voice session is allowed to cost.
//
// A Live session bills continuously for as long as it is open, so this needs a
// ceiling before it needs polish. The check runs under a per-organisation
// advisory lock rather than as a count followed by a create: two clients
// starting at once both pass a separate count, and N instances each enforcing a
// local limit collectively allow N times the intended ceiling.

/** Sessions one organisation may hold open at the same time. */
export const MAX_CONCURRENT_SESSIONS = Number(process.env['VOICE_MAX_CONCURRENT'] ?? 3)

/** Minutes of conversation per organisation per day. */
export const MAX_MINUTES_PER_DAY = Number(process.env['VOICE_MAX_MINUTES_PER_DAY'] ?? 120)

/**
 * How long an open session may be counted as open.
 *
 * A crashed client never sends its close, and without this the row would hold a
 * concurrency slot forever and lock the organisation out of its own feature.
 * Sessions older than this stop counting against the limit.
 */
export const STALE_AFTER_MINUTES = 90

export type BeginResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'concurrent' | 'daily'; message: string }

/**
 * Claim a session slot, or explain why not.
 *
 * The message is written to be read aloud: at the cap the user hears what
 * happened rather than watching a button do nothing.
 */
export async function beginVoiceSession(orgId: string, userId: string | null): Promise<BeginResult> {
  const id = randomUUID()

  // Serialised per organisation, then checked.
  //
  // An earlier version was one INSERT ... SELECT ... WHERE (count) < limit, and
  // called itself atomic. It is not: under READ COMMITTED a subquery in a WHERE
  // clause takes a snapshot and locks nothing, so concurrent inserts are
  // invisible to each other and every one of them sees a free slot. The test
  // that starts several at once granted four against a ceiling of three.
  //
  // The advisory lock is held for the transaction and keyed on the org, so two
  // requests for the same organisation queue and requests for different ones do
  // not touch each other.
  const inserted = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`
    return tx.$executeRaw`
      INSERT INTO "VoiceSession" ("id", "orgId", "userId", "startedAt", "seconds")
      SELECT ${id}, ${orgId}, ${userId}, now(), 0
      WHERE (
        SELECT count(*) FROM "VoiceSession"
        WHERE "orgId" = ${orgId}
          AND "endedAt" IS NULL
          AND "startedAt" > now() - make_interval(mins => ${STALE_AFTER_MINUTES}::int)
      ) < ${MAX_CONCURRENT_SESSIONS}
      AND (
        SELECT COALESCE(sum("seconds"), 0) FROM "VoiceSession"
        WHERE "orgId" = ${orgId}
          AND "startedAt" >= date_trunc('day', now())
      ) < ${MAX_MINUTES_PER_DAY * 60}
    `
  })

  if (inserted === 1) return { ok: true, sessionId: id }

  // Nothing was inserted, so one of the two limits was hit. Which one is worth
  // saying: "come back tomorrow" and "close your other window" are different
  // instructions.
  const usedSeconds = await secondsUsedToday(orgId)
  if (usedSeconds >= MAX_MINUTES_PER_DAY * 60) {
    return {
      ok: false,
      reason: 'daily',
      message: `This organisation has used its ${MAX_MINUTES_PER_DAY} minutes of voice for today.`,
    }
  }

  return {
    ok: false,
    reason: 'concurrent',
    message:
      MAX_CONCURRENT_SESSIONS === 1
        ? 'Voice is already running in another window.'
        : `All ${MAX_CONCURRENT_SESSIONS} voice sessions are in use right now.`,
  }
}

/**
 * Close a session and record what it used.
 *
 * Scoped to the org as well as the id: a session id is a bearer token otherwise,
 * and closing someone else's session would hand them their slot back early.
 */
export async function endVoiceSession(sessionId: string, orgId: string): Promise<{ seconds: number }> {
  const closed = await db.$queryRaw<{ seconds: number }[]>`
    UPDATE "VoiceSession"
    SET "endedAt" = now(),
        "seconds" = GREATEST(0, EXTRACT(EPOCH FROM (now() - "startedAt"))::int)
    WHERE "id" = ${sessionId} AND "orgId" = ${orgId} AND "endedAt" IS NULL
    RETURNING "seconds"
  `
  return { seconds: closed[0]?.seconds ?? 0 }
}

/** Seconds of voice this organisation has used since midnight. */
export async function secondsUsedToday(orgId: string): Promise<number> {
  const rows = await db.$queryRaw<{ total: bigint | number | null }[]>`
    SELECT COALESCE(sum("seconds"), 0) AS total FROM "VoiceSession"
    WHERE "orgId" = ${orgId} AND "startedAt" >= date_trunc('day', now())
  `
  return Number(rows[0]?.total ?? 0)
}

/** Sessions this organisation currently holds open, ignoring stale ones. */
export async function openSessionCount(orgId: string): Promise<number> {
  const rows = await db.$queryRaw<{ count: bigint | number }[]>`
    SELECT count(*) AS count FROM "VoiceSession"
    WHERE "orgId" = ${orgId}
      AND "endedAt" IS NULL
      AND "startedAt" > now() - make_interval(mins => ${STALE_AFTER_MINUTES}::int)
  `
  return Number(rows[0]?.count ?? 0)
}
