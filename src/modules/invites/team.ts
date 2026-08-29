// Who is on a team, and changing it.
//
// Every query in this file names `orgId`. There is no global view across
// organisations, and an id arriving from a browser is never trusted to belong to
// the caller's organisation: it goes into the WHERE clause alongside `orgId`, so
// a row from somebody else's team is not found rather than being found and then
// refused. The difference matters, because "not found" and "not allowed" leak
// different amounts.
//
// Refusals name people. `CLAUDE.md` forbids a raw internal id in anything a
// person reads, and "Sam Whittaker is the only owner" is the sentence that lets
// somebody fix the problem, where a cuid is the sentence that makes them file a
// support ticket.

import type { OrgRole } from '@prisma/client'

import { db } from '@/lib/db'
import { safeAuthFailure } from '@/modules/auth/errors'
import { mintLocalPasswordReset } from '@/modules/auth/password-reset'
import { canRemoveMember, canResetMemberPassword, canSetRole } from './permissions'

export interface TeamMember {
  userId: string
  email: string
  name: string | null
  role: OrgRole
  joinedAt: Date
  /** True while this account still has a pre-Identity-Platform password. */
  legacyCredential: boolean
}

export async function listMembers(orgId: string): Promise<TeamMember[]> {
  const rows = await db.organizationMember.findMany({
    where: { orgId },
    // Explicit, with a stable tiebreaker. Without one, two members created in
    // the same millisecond swap places between renders.
    orderBy: [{ id: 'asc' }],
    select: {
      userId: true,
      role: true,
      user: {
        select: { email: true, name: true, createdAt: true, identityUid: true, passwordHash: true },
      },
    },
  })
  return rows.map((row) => ({
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    role: row.role,
    joinedAt: row.user.createdAt,
    legacyCredential: row.user.identityUid === null && row.user.passwordHash !== null,
  }))
}

export async function countOwners(orgId: string): Promise<number> {
  return db.organizationMember.count({ where: { orgId, role: 'OWNER' } })
}

interface Actor {
  role: OrgRole
}

async function loadActor(orgId: string, userId: string): Promise<Actor | null> {
  const row = await db.organizationMember.findFirst({
    where: { orgId, userId },
    select: { role: true },
  })
  return row ? { role: row.role } : null
}

interface Subject {
  role: OrgRole
  email: string
  name: string | null
}

async function loadSubject(orgId: string, userId: string): Promise<Subject | null> {
  const row = await db.organizationMember.findFirst({
    where: { orgId, userId },
    select: { role: true, user: { select: { email: true, name: true } } },
  })
  return row ? { role: row.role, email: row.user.email, name: row.user.name } : null
}

function nameOf(subject: Subject): string {
  return subject.name?.trim() || subject.email
}

const NOT_ON_THE_TEAM = 'That person is not on your team.'

export interface SetRoleArgs {
  orgId: string
  actorUserId: string
  subjectUserId: string
  role: OrgRole
}

export type SetRoleResult = { ok: true; who: string; role: OrgRole } | { ok: false; error: string }

export async function setMemberRole(args: SetRoleArgs): Promise<SetRoleResult> {
  const [actor, subject] = await Promise.all([
    loadActor(args.orgId, args.actorUserId),
    loadSubject(args.orgId, args.subjectUserId),
  ])
  if (!subject) return { ok: false, error: NOT_ON_THE_TEAM }

  const ownerCount = await countOwners(args.orgId)
  const permitted = canSetRole({
    actorRole: actor?.role ?? null,
    actorUserId: args.actorUserId,
    subjectUserId: args.subjectUserId,
    subjectRole: subject.role,
    targetRole: args.role,
    ownerCount,
  })
  if (!permitted.allowed) return { ok: false, error: permitted.reason }
  if (subject.role === args.role) {
    return { ok: true, who: nameOf(subject), role: args.role }
  }

  try {
    // The org is in the WHERE clause, not just the lookup above, so a membership
    // that moved between the check and the write cannot be updated by accident.
    const changed = await db.organizationMember.updateMany({
      where: { orgId: args.orgId, userId: args.subjectUserId },
      data: { role: args.role },
    })
    if (changed.count !== 1) return { ok: false, error: NOT_ON_THE_TEAM }
    return { ok: true, who: nameOf(subject), role: args.role }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'team.setRole').message }
  }
}

export interface RemoveMemberArgs {
  orgId: string
  actorUserId: string
  subjectUserId: string
}

export type RemoveMemberResult = { ok: true; who: string } | { ok: false; error: string }

/**
 * Take somebody off a team.
 *
 * Removes the membership, not the account. Their Identity Platform sign-in and
 * their memberships of other organisations are none of this organisation's
 * business, and deleting a `User` would cascade into rows other organisations
 * still point at.
 *
 * Any invite still outstanding for their address in this organisation goes with
 * them, so a revoked colleague cannot walk back in through a link that was
 * already in their inbox.
 */
export async function removeMember(args: RemoveMemberArgs): Promise<RemoveMemberResult> {
  const [actor, subject] = await Promise.all([
    loadActor(args.orgId, args.actorUserId),
    loadSubject(args.orgId, args.subjectUserId),
  ])
  if (!subject) return { ok: false, error: NOT_ON_THE_TEAM }

  const ownerCount = await countOwners(args.orgId)
  const permitted = canRemoveMember({
    actorRole: actor?.role ?? null,
    actorUserId: args.actorUserId,
    subjectUserId: args.subjectUserId,
    subjectRole: subject.role,
    ownerCount,
  })
  if (!permitted.allowed) return { ok: false, error: permitted.reason }

  try {
    const now = new Date()
    const removed = await db.$transaction(async (tx) => {
      const result = await tx.organizationMember.deleteMany({
        where: { orgId: args.orgId, userId: args.subjectUserId },
      })
      await tx.authToken.updateMany({
        where: { orgId: args.orgId, kind: 'INVITE', email: subject.email, usedAt: null },
        data: { usedAt: now },
      })
      return result.count
    })
    if (removed !== 1) return { ok: false, error: NOT_ON_THE_TEAM }
    return { ok: true, who: nameOf(subject) }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'team.remove').message }
  }
}

export interface MemberResetArgs {
  orgId: string
  actorUserId: string
  subjectUserId: string
  /** sha256 of a token the caller minted. The raw token never comes in here. */
  tokenHash: string
}

export type MemberResetResult = { ok: true; who: string; email: string } | { ok: false; error: string }

/**
 * Mint a reset link for a team member, for an owner to hand over.
 *
 * Deliberately the local channel rather than Identity Platform's own email: the
 * point of this button is that it works when there is no mail provider and,
 * during a beta, when the builder on the phone cannot find the message. The
 * caller gets a link to read out or paste into a chat.
 *
 * This is a genuine privilege, which is why `canResetMemberPassword` refuses an
 * admin pointing it at an owner: a reset link IS the account, so being able to
 * mint one for somebody is being able to become them.
 */
export async function sendMemberPasswordReset(args: MemberResetArgs): Promise<MemberResetResult> {
  const [actor, subject] = await Promise.all([
    loadActor(args.orgId, args.actorUserId),
    loadSubject(args.orgId, args.subjectUserId),
  ])
  if (!subject) return { ok: false, error: NOT_ON_THE_TEAM }

  const permitted = canResetMemberPassword({
    actorRole: actor?.role ?? null,
    actorUserId: args.actorUserId,
    subjectUserId: args.subjectUserId,
    subjectRole: subject.role,
  })
  if (!permitted.allowed) return { ok: false, error: permitted.reason }

  try {
    await mintLocalPasswordReset({
      userId: args.subjectUserId,
      email: subject.email,
      tokenHash: args.tokenHash,
    })
    return { ok: true, who: nameOf(subject), email: subject.email }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'team.memberReset').message }
  }
}
