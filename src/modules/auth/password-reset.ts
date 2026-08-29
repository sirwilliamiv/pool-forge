// Getting somebody back in when they have forgotten their password.
//
// THE ONE RULE
//
// The answer to "please reset billy@example.com" must be byte-identical whether
// or not that address has an account. Any difference at all (different wording,
// a different status code, a redirect, a measurably different response time) and
// the form becomes a machine for sorting a list of addresses into this product's
// customers and everybody else. That is why `requestPasswordReset` never returns
// anything the caller could branch on except an internal channel label, and why
// the two callers that exist both throw that label away.
//
// TWO CHANNELS, AND WHY BOTH SURVIVE
//
// Credentials live in Google Identity Platform now, and it sends the reset email
// itself, which is the real prize: a builder who forgets their password is no
// longer blocked on this product having a mail provider. So an account that has
// an `identityUid` is handed straight to Identity Platform.
//
// An account that does NOT have one is an account that predates the switch, and
// Identity Platform has never heard of it. Handing that address over would post
// a request that succeeds, sends nothing, and strands a real person. Those go
// down the local `AuthToken` path instead, and completing that reset is also
// what moves the account across, so the local channel drains over time on its
// own without anybody being asked to reset on a schedule.
//
// The local path is also the only one that can hand back a link rather than
// sending mail, which is what makes an owner able to get a team member back in
// during a beta with no mail provider configured. That capability is on the
// authenticated team screen only, never on the public form, because a public
// endpoint that hands out reset links is not an authentication system.

import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { safeAuthFailure } from './errors'
import { identity, identityConfigured } from './identity'
import {
  PASSWORD_RESET_TTL_MS,
  claimToken,
  inspectToken,
  normalizeEmail,
  retireTokens,
  type TokenRefusal,
} from './tokens'

const BCRYPT_COST = 12

/** Shortest password accepted when this product is the one storing it. */
export const MIN_PASSWORD_LENGTH = 8

/**
 * What a person is told after asking for a reset, whatever actually happened.
 *
 * Names no address back, confirms nothing, promises nothing that would be a lie
 * for a stranger typing somebody else's address into the box.
 */
export const RESET_REQUESTED =
  'If that address has a Pool Forge account, a link to set a new password is on its way. ' +
  'Check the inbox, and the spam folder.'

export const RESET_THROTTLED =
  'Too many password requests from this connection. Please wait a while and try again.'

/** Which route a request actually took. Internal: never returned to a browser. */
export type ResetChannel = 'identity' | 'local' | 'none'

export interface RequestPasswordResetArgs {
  email: string
  /**
   * sha256 of a token the caller minted. Supplied unconditionally even though
   * the identity channel will not use it, because the caller cannot know which
   * channel will run without being told which accounts exist, which is the one
   * thing it must not learn.
   */
  tokenHash: string
  now?: Date
}

/**
 * Start a reset. Never throws, never reveals.
 *
 * A failure anywhere in here is swallowed into `channel: 'none'`. That is not
 * sloppiness: an error surfacing for a known address and not for an unknown one
 * is the oracle again, wearing a stack trace.
 */
export async function requestPasswordReset(
  args: RequestPasswordResetArgs,
): Promise<{ channel: ResetChannel }> {
  const now = args.now ?? new Date()
  const email = normalizeEmail(args.email)

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, identityUid: true },
    })
    if (!user) return { channel: 'none' }

    if (user.identityUid && identityConfigured()) {
      const sent = await identity().sendPasswordReset(email)
      // A refusal is recorded by the identity client against a ref and is not
      // acted on here. There is nothing useful to do with it: the caller is
      // going to say the same sentence either way.
      return { channel: sent.ok ? 'identity' : 'none' }
    }

    await mintLocalPasswordReset({ userId: user.id, email, tokenHash: args.tokenHash, now })
    return { channel: 'local' }
  } catch (err) {
    safeAuthFailure(err, 'reset.request')
    return { channel: 'none' }
  }
}

export interface MintLocalResetArgs {
  userId: string
  email: string
  tokenHash: string
  now?: Date
}

/**
 * Write a local reset token, retiring any that are still outstanding.
 *
 * Two live reset links to one account is twice the exposure for no benefit: the
 * person is going to click the newest mail in their inbox.
 */
export async function mintLocalPasswordReset(args: MintLocalResetArgs): Promise<{ expiresAt: Date }> {
  const now = args.now ?? new Date()
  const email = normalizeEmail(args.email)
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS)

  await db.$transaction(async (tx) => {
    await retireTokens(tx, 'PASSWORD_RESET', { email }, now)
    await tx.authToken.create({
      data: {
        kind: 'PASSWORD_RESET',
        email,
        tokenHash: args.tokenHash,
        expiresAt,
        userId: args.userId,
      },
    })
  })

  return { expiresAt }
}

export interface ResetPreview {
  email: string
}

export type ResetPreviewResult =
  | { ok: true; preview: ResetPreview }
  | { ok: false; refusal: TokenRefusal }

/** Read a reset link without spending it, so the form can be rendered. */
export async function previewPasswordReset(
  token: string,
  now: Date = new Date(),
): Promise<ResetPreviewResult> {
  const inspected = await inspectToken(db, 'PASSWORD_RESET', token, now)
  if (!inspected.ok) return { ok: false, refusal: inspected.refusal }
  return { ok: true, preview: { email: inspected.token.email } }
}

export interface CompletePasswordResetArgs {
  token: string
  password: string
  now?: Date
}

export type CompletePasswordResetResult =
  | { ok: true; email: string; userId: string }
  | { ok: false; error: string; refusal?: TokenRefusal }

/**
 * Set a new password from a local reset link.
 *
 * Completing one of these is also the moment a pre-Identity-Platform account
 * moves across: the new password is written to Identity Platform rather than to
 * `passwordHash`, and the local column is nulled. That is the whole migration,
 * done one account at a time by the people who were going to type a new password
 * anyway, with nobody asked to reset on a deadline.
 */
export async function completePasswordReset(
  args: CompletePasswordResetArgs,
): Promise<CompletePasswordResetResult> {
  const now = args.now ?? new Date()

  const inspected = await inspectToken(db, 'PASSWORD_RESET', args.token, now)
  if (!inspected.ok) return { ok: false, error: '', refusal: inspected.refusal }

  const { email, userId } = inspected.token
  if (!userId) return { ok: false, error: '', refusal: 'unknown' }

  if (args.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  // Decided and computed before the transaction. bcrypt is 300ms and an identity
  // call can be seconds; neither belongs inside a row lock.
  const credential = await nextCredential(email, args.password)
  if (!credential.ok) return { ok: false, error: credential.error }

  try {
    const spent = await db.$transaction(async (tx) => {
      const claim = await claimToken(tx, 'PASSWORD_RESET', args.token, now)
      if (!claim.ok) return { refusal: claim.refusal } as const

      await tx.user.update({
        where: { id: userId },
        data: credential.update,
      })
      // Every other outstanding link for this address dies with the reset. If
      // somebody asked twice because the first mail was slow, the older link is
      // not left live afterwards.
      await retireTokens(tx, 'PASSWORD_RESET', { email }, now)
      return { refusal: null } as const
    })

    if (spent.refusal) return { ok: false, error: '', refusal: spent.refusal }
    return { ok: true, email, userId }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'reset.complete').message }
  }
}

type CredentialUpdate = Prisma.UserUpdateInput

/**
 * Where the new password is going to live, worked out before anything is
 * written.
 *
 * `email-exists` is the awkward case: Identity Platform already knows this
 * address, but a browser API key cannot set an existing account's password. The
 * password is written locally instead, so the person is not stranded, and the
 * account stays on the legacy path until an Identity Platform reset moves it.
 */
async function nextCredential(
  email: string,
  password: string,
): Promise<{ ok: true; update: CredentialUpdate } | { ok: false; error: string }> {
  if (identityConfigured()) {
    const created = await identity().createUser(email, password)
    if (created.ok) {
      return { ok: true, update: { identityUid: created.data.uid, passwordHash: null } }
    }
    if (created.failure === 'weak-password') {
      return { ok: false, error: 'That password is too easy to guess. Choose a longer one.' }
    }
    if (created.failure !== 'email-exists') {
      const ref = created.ref ? ` (ref ${created.ref})` : ''
      return { ok: false, error: `Could not set the password. Please try again.${ref}` }
    }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  return { ok: true, update: { passwordHash } }
}
