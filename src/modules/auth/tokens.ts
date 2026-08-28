// One-time links: minting them, and spending them exactly once.
//
// An invite and a password reset are the same object wearing two hats. Both are
// a secret that arrives in an email and turns into the ability to set a
// password, so they share `AuthToken`, this module, and one lifecycle, rather
// than growing two near-identical implementations that drift apart on the day
// one of them gets a fix.
//
// THE TOKEN IS NEVER STORED
//
// Only `sha256(token)` reaches the database, which is why a dump of `AuthToken`
// grants nobody an account: the secret exists in the recipient's mailbox and in
// the one HTTP response that handed it over, and nowhere else. Not in a log
// line, not in a `CommandAuditLog` row, not in an error message. sha256 rather
// than bcrypt because the input is 256 bits of `randomBytes`, not something a
// person chose: there is no dictionary to attack and nothing for a work factor
// to slow down.
//
// SINGLE USE, UNDER CONCURRENCY
//
// "Safe to click twice" is not a UI problem, it is a race. Two clicks that land
// together must not both create an account. `claimToken` therefore spends the
// row with a conditional `updateMany` inside the caller's transaction:
//
//   UPDATE "AuthToken" SET "usedAt" = now
//    WHERE "tokenHash" = $1 AND "kind" = $2 AND "usedAt" IS NULL AND "expiresAt" > now
//
// Postgres takes a row lock on the match, so the second transaction blocks until
// the first commits and then finds `usedAt` already set and updates zero rows.
// The affected-row count is the verdict. No SELECT-then-UPDATE anywhere, which
// is the shape that would let both clicks through.

import { createHash, randomBytes } from 'node:crypto'
import type { AuthTokenKind, Prisma, PrismaClient } from '@prisma/client'

/**
 * How long an invite stands: one week.
 *
 * Long enough for a builder who reads email on Sunday evening, short enough that
 * a link forwarded into a group chat in March is not still a way into somebody's
 * organisation in June. A revoke button exists for the cases that cannot wait,
 * and re-inviting supersedes the old link rather than adding a second live one.
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How long a reset link stands: one hour.
 *
 * The person is at a keyboard asking for it right now, so an hour is generous,
 * and the window is the whole exposure: whoever holds this link can take the
 * account. Days would mean a stale message in a mailbox somebody else later gets
 * access to is still a working credential.
 */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

/** 32 bytes, base64url. 256 bits of entropy: not guessable, and URL-safe. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** An invite to Sam@example.com is an invite to sam@example.com. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Cheap shape check before a database round trip.
 *
 * A link that has been truncated by a mail client, or a path segment somebody
 * typed, should not become a query. It refuses nothing a real token would pass:
 * base64url of 32 bytes is always 43 characters.
 */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}

/** Why a link did not work. Each maps to one sentence a person is shown. */
export type TokenRefusal = 'unknown' | 'expired' | 'used'

export type ClaimedToken = {
  id: string
  email: string
  orgId: string | null
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | null
  userId: string | null
  invitedById: string | null
}

export type ClaimResult =
  | { ok: true; token: ClaimedToken }
  | { ok: false; refusal: TokenRefusal }

/** Anything with the Prisma model methods: the client, or a transaction handle. */
type TokenClient = Pick<PrismaClient, 'authToken'> | Prisma.TransactionClient

/**
 * Read a token without spending it, to decide what to put on the screen.
 *
 * Used by the GET that renders a "set your password" page, so somebody clicking
 * an expired link is told so before typing a password rather than after. It is
 * deliberately separate from `claimToken`: rendering a form must not consume the
 * one use.
 */
export async function inspectToken(
  client: TokenClient,
  kind: AuthTokenKind,
  token: string,
  now: Date = new Date(),
): Promise<ClaimResult> {
  if (!looksLikeToken(token)) return { ok: false, refusal: 'unknown' }
  const row = await client.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      kind: true,
      email: true,
      orgId: true,
      role: true,
      userId: true,
      invitedById: true,
      usedAt: true,
      expiresAt: true,
    },
  })
  if (!row || row.kind !== kind) return { ok: false, refusal: 'unknown' }
  if (row.usedAt !== null) return { ok: false, refusal: 'used' }
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, refusal: 'expired' }
  return {
    ok: true,
    token: {
      id: row.id,
      email: row.email,
      orgId: row.orgId,
      role: row.role,
      userId: row.userId,
      invitedById: row.invitedById,
    },
  }
}

/**
 * Spend a token, or explain why it could not be spent.
 *
 * Call this inside the transaction that does the work the token authorises, so a
 * failure part-way through gives the link back rather than burning it. The
 * conditional update is what makes a double click safe; the follow-up read only
 * runs on the losing path and only to choose wording.
 */
export async function claimToken(
  tx: Prisma.TransactionClient,
  kind: AuthTokenKind,
  token: string,
  now: Date = new Date(),
): Promise<ClaimResult> {
  if (!looksLikeToken(token)) return { ok: false, refusal: 'unknown' }
  const tokenHash = hashToken(token)

  const spent = await tx.authToken.updateMany({
    where: { tokenHash, kind, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })

  if (spent.count === 1) {
    const row = await tx.authToken.findUnique({
      where: { tokenHash },
      select: { id: true, email: true, orgId: true, role: true, userId: true, invitedById: true },
    })
    // Cannot be missing: the update above just matched it inside this
    // transaction. Narrowing rather than asserting, because `!` here would be a
    // crash on a row somebody deleted concurrently.
    if (!row) return { ok: false, refusal: 'unknown' }
    return { ok: true, token: row }
  }

  return { ok: false, refusal: await refusalFor(tx, tokenHash, kind, now) }
}

async function refusalFor(
  tx: Prisma.TransactionClient,
  tokenHash: string,
  kind: AuthTokenKind,
  now: Date,
): Promise<TokenRefusal> {
  const row = await tx.authToken.findUnique({
    where: { tokenHash },
    select: { kind: true, usedAt: true, expiresAt: true },
  })
  if (!row || row.kind !== kind) return 'unknown'
  if (row.usedAt !== null) return 'used'
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'unknown'
}

/**
 * Retire every outstanding link of one kind for an address.
 *
 * Used when a fresh one is issued, and after a reset completes. Two live links
 * to the same account is twice the exposure for no benefit: the person is going
 * to click the newest mail in their inbox.
 *
 * `usedAt` is the retirement marker because it is the column that already means
 * "this cannot be redeemed", and adding a `revokedAt` would be a second way to
 * say the same thing that every read would then have to check.
 */
export async function retireTokens(
  client: TokenClient,
  kind: AuthTokenKind,
  where: { email: string; orgId?: string },
  now: Date = new Date(),
): Promise<number> {
  const filter: Prisma.AuthTokenWhereInput = {
    kind,
    email: where.email,
    usedAt: null,
  }
  if (where.orgId !== undefined) filter.orgId = where.orgId
  const result = await client.authToken.updateMany({ where: filter, data: { usedAt: now } })
  return result.count
}

/**
 * Drop links that expired long enough ago that nothing will read them again.
 *
 * Nothing schedules this yet. It exists so the table has a defined way to stop
 * growing and is safe to call from any future sweep job.
 */
export async function sweepExpiredAuthTokens(
  client: TokenClient,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const result = await client.authToken.deleteMany({ where: { expiresAt: { lt: cutoff } } })
  return result.count
}
