// Invites: issuing one, and turning one into a member.
//
// Pool Forge is invite only. There is no other way for a `User` row to come into
// existence, which is the whole point of this module existing rather than a
// sign-up form.
//
// WHERE THE SECRET LIVES
//
// The raw token is never created here and never returned from here. The caller
// mints it, hands over only `sha256(token)`, and keeps the raw value long enough
// to put it in one email or one response. That is not fussiness: every command
// in this codebase writes its input and output to `CommandAuditLog`, so a token
// that travelled through a command would be a live credential sitting in a
// database table forever. Passing the hash means the audit row records exactly
// what `AuthToken` records, which is a hash of a secret nobody has.
//
// WHAT AN INVITE CARRIES THAT IDENTITY PLATFORM CANNOT
//
// Credentials moved to Google Identity Platform, but an invite is not a
// credential. It says which organisation somebody is joining and what they will
// be allowed to do in it, and Identity Platform has no idea either concept
// exists. So `AuthToken` stays, and acceptance drives both: it creates the
// Identity Platform account, then the local row that joins that account to an
// organisation with a role.

import type { OrgRole, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { db } from '@/lib/db'
import { AUTH_MESSAGES, safeAuthFailure } from '@/modules/auth/errors'
import { identity, identityConfigured } from '@/modules/auth/identity'
import { verifyCredentialPassword } from '@/modules/auth/password'
import {
  INVITE_TTL_MS,
  claimToken,
  inspectToken,
  normalizeEmail,
  retireTokens,
  type TokenRefusal,
} from '@/modules/auth/tokens'
import { canInvite } from './permissions'

/** Matches the cost the pre-Identity-Platform accounts were written with. */
const BCRYPT_COST = 12

/** Shortest password this product will accept when it is the one storing it. */
export const MIN_PASSWORD_LENGTH = 8

/**
 * A DB transaction that contains one call to an identity service.
 *
 * Prisma's five-second default would abort the moment Identity Platform had a
 * slow second, and the failure would look like a database problem. The window is
 * the identity client's own eight-second deadline plus room to finish the
 * writes. The only row locked for that time is the single `AuthToken` being
 * spent, and the only contender for it is a second click on the same link, which
 * is precisely what should be waiting.
 */
const ACCEPT_TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const

export type InviteRefusalMessage = Record<TokenRefusal, string>

/**
 * One sentence per way a link can fail, written for the person holding it.
 *
 * "Already used" is separate from "not a valid link" on purpose: somebody who
 * clicks the same invite twice, or whose mail client prefetched it, needs to be
 * pointed at the sign-in page rather than told the link is broken.
 */
export const INVITE_REFUSAL: InviteRefusalMessage = {
  unknown: 'That invite link is not valid. Ask whoever invited you to send a new one.',
  expired: 'That invite link has expired. Ask whoever invited you to send a new one.',
  used: 'That invite link has already been used. Try signing in instead.',
}

export const RESET_REFUSAL: InviteRefusalMessage = {
  unknown: 'That password link is not valid. Request a new one from the sign-in page.',
  expired: 'That password link has expired. Request a new one from the sign-in page.',
  used: 'That password link has already been used. Try signing in instead.',
}

// ============================================================
// Issuing
// ============================================================

export interface CreateInviteArgs {
  orgId: string
  actorUserId: string
  email: string
  role: OrgRole
  /** sha256 of the token the caller minted. The raw token never comes in here. */
  tokenHash: string
  now?: Date
}

export interface Invite {
  inviteId: string
  email: string
  role: OrgRole
  expiresAt: Date
  orgName: string
}

export type CreateInviteResult = { ok: true; invite: Invite } | { ok: false; error: string }

export async function createInvite(args: CreateInviteArgs): Promise<CreateInviteResult> {
  const now = args.now ?? new Date()
  const email = normalizeEmail(args.email)

  const actor = await db.organizationMember.findFirst({
    where: { orgId: args.orgId, userId: args.actorUserId },
    select: { role: true, org: { select: { name: true } } },
  })
  if (!actor) return { ok: false, error: 'You are not a member of this organisation.' }

  const permitted = canInvite(actor.role, args.role)
  if (!permitted.allowed) return { ok: false, error: permitted.reason }

  // Scoped to this organisation, which is both the correct check and the only
  // one that is safe to answer. Whether the address has an account SOMEWHERE is
  // not this screen's business: see the note on `canInvite`.
  const alreadyMember = await db.organizationMember.findFirst({
    where: { orgId: args.orgId, user: { email } },
    select: { user: { select: { name: true, email: true } } },
  })
  if (alreadyMember) {
    const who = alreadyMember.user.name ?? alreadyMember.user.email
    return { ok: false, error: `${who} is already on your team.` }
  }

  try {
    const invite = await db.$transaction(async (tx) => {
      // Re-inviting replaces rather than adds. Two live links to one address is
      // twice the exposure and the person is going to click the newest mail
      // anyway. This is also what makes the invite button double as "resend".
      await retireTokens(tx, 'INVITE', { email, orgId: args.orgId }, now)
      return tx.authToken.create({
        data: {
          kind: 'INVITE',
          email,
          tokenHash: args.tokenHash,
          expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
          orgId: args.orgId,
          role: args.role,
          invitedById: args.actorUserId,
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      })
    })

    return {
      ok: true,
      invite: {
        inviteId: invite.id,
        email: invite.email,
        // Narrowing rather than asserting: `role` is nullable on the model
        // because resets do not carry one, but every invite writes it above.
        role: invite.role ?? args.role,
        expiresAt: invite.expiresAt,
        orgName: actor.org.name,
      },
    }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'invite.create', 'registerUnavailable').message }
  }
}

export interface RevokeInviteArgs {
  orgId: string
  actorUserId: string
  inviteId: string
  now?: Date
}

export type RevokeInviteResult = { ok: true; email: string } | { ok: false; error: string }

export async function revokeInvite(args: RevokeInviteArgs): Promise<RevokeInviteResult> {
  const now = args.now ?? new Date()

  const actor = await db.organizationMember.findFirst({
    where: { orgId: args.orgId, userId: args.actorUserId },
    select: { role: true },
  })
  const permitted = canInvite(actor?.role ?? null, 'MEMBER')
  if (!permitted.allowed) return { ok: false, error: permitted.reason }

  // `updateMany` with the org in the filter, so an id belonging to another
  // organisation matches nothing rather than being found and then rejected.
  // Same reason the response below never echoes the id back.
  const invite = await db.authToken.findFirst({
    where: { id: args.inviteId, orgId: args.orgId, kind: 'INVITE', usedAt: null },
    select: { email: true },
  })
  if (!invite) return { ok: false, error: 'That invite is no longer pending.' }

  await db.authToken.updateMany({
    where: { id: args.inviteId, orgId: args.orgId, kind: 'INVITE', usedAt: null },
    data: { usedAt: now },
  })
  return { ok: true, email: invite.email }
}

// ============================================================
// Accepting
// ============================================================

export interface InvitePreview {
  email: string
  orgName: string
  role: OrgRole
  /** True when the address already has a Pool Forge account. */
  hasAccount: boolean
}

export type InvitePreviewResult =
  | { ok: true; preview: InvitePreview }
  | { ok: false; error: string }

/**
 * What to render on the accept page, without spending the link.
 *
 * `hasAccount` changes the form from "choose a password" to "enter your Pool
 * Forge password". Telling the holder of the link whether the address has an
 * account is not an oracle: they had to hold 256 bits of secret addressed to
 * that mailbox to get here, and it is their own mailbox.
 */
export async function previewInvite(
  token: string,
  now: Date = new Date(),
): Promise<InvitePreviewResult> {
  const inspected = await inspectToken(db, 'INVITE', token, now)
  if (!inspected.ok) return { ok: false, error: INVITE_REFUSAL[inspected.refusal] }

  const { email, orgId, role } = inspected.token
  if (!orgId || !role) return { ok: false, error: INVITE_REFUSAL.unknown }

  const [org, user] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    db.user.findUnique({ where: { email }, select: { id: true } }),
  ])
  if (!org) return { ok: false, error: INVITE_REFUSAL.unknown }

  return { ok: true, preview: { email, orgName: org.name, role, hasAccount: user !== null } }
}

export interface AcceptInviteArgs {
  token: string
  password: string
  name?: string
  now?: Date
}

export type AcceptOutcome = 'created' | 'joined' | 'already-member'

export interface AcceptedInvite {
  outcome: AcceptOutcome
  email: string
  orgId: string
  orgName: string
  role: OrgRole
  userId: string
}

export type AcceptInviteResult =
  | { ok: true; accepted: AcceptedInvite }
  | { ok: false; error: string }

/**
 * Turn an invite into a membership.
 *
 * Three shapes, and which one runs is decided by whether the address already has
 * an account:
 *
 *   created       No account existed. The password sets one up: an Identity
 *                 Platform account when it is configured, a local hash when it
 *                 is not.
 *   joined        An account existed and the password given is that account's.
 *                 It is added to the new organisation and its password is NOT
 *                 touched. This is why the existing password is asked for rather
 *                 than a new one being set: otherwise an invite link would be a
 *                 way to overwrite the credentials of an account that has
 *                 nothing to do with the inviting organisation.
 *   already-member  The account is already in this organisation. The link is
 *                 spent and they are pointed at sign-in.
 */
export async function acceptInvite(args: AcceptInviteArgs): Promise<AcceptInviteResult> {
  const now = args.now ?? new Date()

  const inspected = await inspectToken(db, 'INVITE', args.token, now)
  if (!inspected.ok) return { ok: false, error: INVITE_REFUSAL[inspected.refusal] }
  const { email, orgId, role } = inspected.token
  if (!orgId || !role) return { ok: false, error: INVITE_REFUSAL.unknown }

  const org = await db.organization.findUnique({ where: { id: orgId }, select: { name: true } })
  if (!org) return { ok: false, error: INVITE_REFUSAL.unknown }

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, identityUid: true, passwordHash: true },
  })

  if (existing) {
    // Joining with an existing account. The password typed must be that
    // account's, checked exactly the way sign-in checks it.
    const verified = await verifyExistingPassword(existing, args.password, email)
    if (!verified) return { ok: false, error: AUTH_MESSAGES.invalidCredentials }

    const member = await db.organizationMember.findFirst({
      where: { orgId, userId: existing.id },
      select: { id: true },
    })

    try {
      const outcome = await db.$transaction(async (tx) => {
        const claim = await claimToken(tx, 'INVITE', args.token, now)
        if (!claim.ok) return { refusal: claim.refusal } as const
        if (!member) {
          await tx.organizationMember.create({ data: { orgId, userId: existing.id, role } })
        }
        return { refusal: null } as const
      })
      if (outcome.refusal) return { ok: false, error: INVITE_REFUSAL[outcome.refusal] }
    } catch (err) {
      return { ok: false, error: safeAuthFailure(err, 'invite.join', 'registerUnavailable').message }
    }

    return {
      ok: true,
      accepted: {
        outcome: member ? 'already-member' : 'joined',
        email,
        orgId,
        orgName: org.name,
        role,
        userId: existing.id,
      },
    }
  }

  // A brand-new account. This is the only path in the product that creates one.
  if (args.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  // bcrypt is only reached when Identity Platform is not configured, and it is
  // computed before the transaction either way so a 300ms hash never holds a row
  // lock.
  const useIdentity = identityConfigured()
  const passwordHash = useIdentity ? null : await bcrypt.hash(args.password, BCRYPT_COST)

  try {
    const created = await db.$transaction(async (tx) => {
      const claim = await claimToken(tx, 'INVITE', args.token, now)
      if (!claim.ok) return { refusal: claim.refusal } as const

      let identityUid: string | null = null
      if (useIdentity) {
        const provisioned = await provisionIdentityUser(email, args.password)
        if (!provisioned.ok) return { failure: provisioned.error } as const
        identityUid = provisioned.uid
      }

      const user = await tx.user.create({
        data: {
          email,
          identityUid,
          passwordHash,
          name: args.name?.trim() ? args.name.trim() : null,
        },
        select: { id: true },
      })
      await tx.organizationMember.create({ data: { orgId, userId: user.id, role } })
      return { userId: user.id } as const
    }, ACCEPT_TX_OPTIONS)

    if ('refusal' in created) return { ok: false, error: INVITE_REFUSAL[created.refusal] }
    if ('failure' in created) return { ok: false, error: created.failure }

    return {
      ok: true,
      accepted: {
        outcome: 'created',
        email,
        orgId,
        orgName: org.name,
        role,
        userId: created.userId,
      },
    }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'invite.accept', 'registerUnavailable').message }
  }
}

/**
 * Create the Identity Platform account for an address that is new to us.
 *
 * `email-exists` is the awkward one: Identity Platform knows the address but we
 * have no local row for it, which happens when a previous acceptance created the
 * account and then failed before committing. Rather than stranding somebody
 * behind a permanent error, the password they just typed is offered to Identity
 * Platform: if it is that account's password, the account is adopted. If it is
 * not, they are told plainly, because the alternative is silently attaching an
 * organisation to credentials they have not proved they hold.
 */
async function provisionIdentityUser(
  email: string,
  password: string,
): Promise<{ ok: true; uid: string } | { ok: false; error: string }> {
  const created = await identity().createUser(email, password)
  if (created.ok) return { ok: true, uid: created.data.uid }

  if (created.failure === 'email-exists') {
    const verified = await identity().verifyPassword(email, password)
    if (verified.ok) return { ok: true, uid: verified.data.uid }
    return {
      ok: false,
      error:
        'There is already a sign-in for this address. Use your existing password, or the ' +
        'forgotten-password link on the sign-in page.',
    }
  }

  if (created.failure === 'weak-password') {
    return { ok: false, error: 'That password is too easy to guess. Choose a longer one.' }
  }

  const ref = created.ref ? ` (ref ${created.ref})` : ''
  return { ok: false, error: `${AUTH_MESSAGES.registerUnavailable}${ref}` }
}

/**
 * Check a password for an account that already exists, the same way sign-in
 * does: Identity Platform first, the legacy local hash second.
 *
 * Deliberately does NOT migrate the account across on success. Migration belongs
 * on one code path, in `lib/auth.ts`, so there is one place where the rules for
 * moving an account are written down.
 */
async function verifyExistingPassword(
  user: { identityUid: string | null; passwordHash: string | null },
  password: string,
  email: string,
): Promise<boolean> {
  if (identityConfigured()) {
    const verified = await identity().verifyPassword(email, password)
    if (verified.ok) return true
  }
  return verifyCredentialPassword(user.passwordHash, password)
}

/** For the pending-invite list. Scoped to one organisation, always. */
export interface PendingInvite {
  id: string
  email: string
  role: OrgRole
  expiresAt: Date
  invitedByEmail: string | null
}

export async function listPendingInvites(
  orgId: string,
  now: Date = new Date(),
): Promise<PendingInvite[]> {
  const rows = await db.authToken.findMany({
    where: { orgId, kind: 'INVITE', usedAt: null, expiresAt: { gt: now } },
    // Explicit, with a stable tiebreaker: without one the order of two invites
    // created in the same millisecond is whatever the planner felt like.
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      invitedBy: { select: { email: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role ?? 'MEMBER',
    expiresAt: row.expiresAt,
    invitedByEmail: row.invitedBy?.email ?? null,
  }))
}

/** Narrowing helper for callers that need the Prisma types without importing them. */
export type InviteTransaction = Prisma.TransactionClient
