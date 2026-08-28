// Who may do what to a team.
//
// `OrganizationMember.role` finally means something. The rules below are the
// same shape as `pricing/change-requests.ts`: OWNER and ADMIN are the people who
// keep things, MEMBER is everybody else. Where this goes further is that team
// management can hand out the very privilege being exercised, so two extra rules
// exist that the price book does not need:
//
//   1. Nobody may grant a role above their own. An ADMIN who could invite an
//      OWNER has made themselves an OWNER by way of a second account, and every
//      other check in this file is then decoration.
//
//   2. An organisation always has at least one OWNER. Not a style preference: an
//      org with no OWNER has nobody who can promote anybody, so it is a dead
//      organisation with live data in it and no way back short of a database
//      console.
//
// Refusals name people, never rows. "Only an owner can do that" is actionable;
// a cuid is not, and `CLAUDE.md` forbids putting one in front of a person
// anyway.

import type { OrgRole } from '@prisma/client'

export const ORG_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const satisfies readonly OrgRole[]

/** Higher outranks lower. Used for "may not grant above your own". */
const RANK: Record<OrgRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 }

export function rankOf(role: OrgRole): number {
  return RANK[role]
}

/** Roles that may open the team screen and change anything on it. */
export const TEAM_KEEPER_ROLES = ['OWNER', 'ADMIN'] as const

export function canManageTeam(role: OrgRole | null | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

/** What a plain member is told. Names the job, not the row. */
export const NOT_A_TEAM_KEEPER =
  'Only an owner or an admin can change who is on the team.'

export const CANNOT_GRANT_ABOVE_OWN_ROLE =
  'You can only give somebody the same access you have, or less.'

export const CANNOT_CHANGE_OWN_ROLE =
  'You cannot change your own access. Ask another owner to do it.'

export const CANNOT_REMOVE_SELF =
  'You cannot remove yourself from the team. Ask another owner to do it.'

export const LAST_OWNER =
  'This is the only owner of the organisation. Make somebody else an owner first.'

export const ADMIN_CANNOT_TOUCH_KEEPER =
  'Only an owner can change another owner or admin.'

export type PermissionCheck = { allowed: true } | { allowed: false; reason: string }

const ALLOWED: PermissionCheck = { allowed: true }

function refuse(reason: string): PermissionCheck {
  return { allowed: false, reason }
}

/**
 * May `actorRole` invite somebody at `targetRole`?
 *
 * Note what is NOT checked here: whether the address already has a Pool Forge
 * account anywhere. Refusing on that would answer "does this person use Pool
 * Forge" to anybody with an admin seat on any organisation, which is a
 * cross-tenant enumeration oracle bought for no benefit. Membership of THIS
 * organisation is a different matter and is checked by the caller, because the
 * inviter can already read that from the screen they are standing on.
 */
export function canInvite(actorRole: OrgRole | null, targetRole: OrgRole): PermissionCheck {
  if (!canManageTeam(actorRole)) return refuse(NOT_A_TEAM_KEEPER)
  // `canManageTeam` has already narrowed this to OWNER or ADMIN.
  if (actorRole === null) return refuse(NOT_A_TEAM_KEEPER)
  if (rankOf(targetRole) > rankOf(actorRole)) return refuse(CANNOT_GRANT_ABOVE_OWN_ROLE)
  return ALLOWED
}

/**
 * May `actorRole` change `subjectRole` to `targetRole`?
 *
 * Self-changes are refused outright rather than conditionally. An owner
 * demoting themselves while another owner exists is harmless in isolation, but
 * the rule with the exception is the one people get wrong, and the workaround is
 * one step: promote somebody, let them demote you.
 */
export function canSetRole(args: {
  actorRole: OrgRole | null
  actorUserId: string
  subjectUserId: string
  subjectRole: OrgRole
  targetRole: OrgRole
  ownerCount: number
}): PermissionCheck {
  const { actorRole, actorUserId, subjectUserId, subjectRole, targetRole, ownerCount } = args
  if (!canManageTeam(actorRole) || actorRole === null) return refuse(NOT_A_TEAM_KEEPER)
  if (actorUserId === subjectUserId) return refuse(CANNOT_CHANGE_OWN_ROLE)
  if (rankOf(targetRole) > rankOf(actorRole)) return refuse(CANNOT_GRANT_ABOVE_OWN_ROLE)
  if (actorRole === 'ADMIN' && rankOf(subjectRole) >= rankOf(actorRole)) {
    return refuse(ADMIN_CANNOT_TOUCH_KEEPER)
  }
  if (subjectRole === 'OWNER' && targetRole !== 'OWNER' && ownerCount <= 1) {
    return refuse(LAST_OWNER)
  }
  return ALLOWED
}

/** May `actorRole` remove `subjectRole` from the organisation? */
export function canRemoveMember(args: {
  actorRole: OrgRole | null
  actorUserId: string
  subjectUserId: string
  subjectRole: OrgRole
  ownerCount: number
}): PermissionCheck {
  const { actorRole, actorUserId, subjectUserId, subjectRole, ownerCount } = args
  if (!canManageTeam(actorRole) || actorRole === null) return refuse(NOT_A_TEAM_KEEPER)
  if (actorUserId === subjectUserId) return refuse(CANNOT_REMOVE_SELF)
  if (actorRole === 'ADMIN' && rankOf(subjectRole) >= rankOf(actorRole)) {
    return refuse(ADMIN_CANNOT_TOUCH_KEEPER)
  }
  if (subjectRole === 'OWNER' && ownerCount <= 1) return refuse(LAST_OWNER)
  return ALLOWED
}

/**
 * May `actorRole` mint a password-reset link for `subjectRole`?
 *
 * Tighter than it first looks, because a reset link IS the account. An admin who
 * could issue one for an owner would take that owner's seat with two clicks, so
 * the same "an admin may not touch a keeper" rule applies here as to removal.
 */
export function canResetMemberPassword(args: {
  actorRole: OrgRole | null
  actorUserId: string
  subjectUserId: string
  subjectRole: OrgRole
}): PermissionCheck {
  const { actorRole, actorUserId, subjectUserId, subjectRole } = args
  if (!canManageTeam(actorRole) || actorRole === null) return refuse(NOT_A_TEAM_KEEPER)
  if (actorUserId === subjectUserId) {
    return refuse('Use the forgotten-password link on the sign-in page for your own account.')
  }
  if (actorRole === 'ADMIN' && rankOf(subjectRole) >= rankOf(actorRole)) {
    return refuse(ADMIN_CANNOT_TOUCH_KEEPER)
  }
  return ALLOWED
}
