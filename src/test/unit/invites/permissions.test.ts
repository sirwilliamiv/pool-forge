// Who may do what to a team. Pure functions, no database, no network.
//
// These rules are the whole of the authorisation story for team management, and
// two of them are the kind that only bite once, in production, permanently:
// letting an admin hand out an owner seat, and letting the last owner be removed
// from an organisation that then has nobody who can promote anybody.

import { describe, expect, it } from 'vitest'

import {
  ADMIN_CANNOT_TOUCH_KEEPER,
  CANNOT_CHANGE_OWN_ROLE,
  CANNOT_GRANT_ABOVE_OWN_ROLE,
  CANNOT_REMOVE_SELF,
  LAST_OWNER,
  NOT_A_TEAM_KEEPER,
  canInvite,
  canManageTeam,
  canRemoveMember,
  canResetMemberPassword,
  canSetRole,
} from '@/modules/invites/permissions'

const OWNER = 'owner-1'
const ADMIN = 'admin-1'
const MEMBER = 'member-1'

describe('canManageTeam', () => {
  it('is the same set of roles that keeps the price book', () => {
    expect(canManageTeam('OWNER')).toBe(true)
    expect(canManageTeam('ADMIN')).toBe(true)
    expect(canManageTeam('MEMBER')).toBe(false)
    expect(canManageTeam(null)).toBe(false)
    expect(canManageTeam(undefined)).toBe(false)
  })
})

describe('canInvite', () => {
  it('lets an owner invite anybody', () => {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER'] as const) {
      expect(canInvite('OWNER', role)).toEqual({ allowed: true })
    }
  })

  it('refuses an admin trying to mint an owner', () => {
    // Otherwise an admin becomes an owner by inviting a second address they
    // control, and every other rule in this file is decoration.
    expect(canInvite('ADMIN', 'OWNER')).toEqual({
      allowed: false,
      reason: CANNOT_GRANT_ABOVE_OWN_ROLE,
    })
    expect(canInvite('ADMIN', 'ADMIN')).toEqual({ allowed: true })
    expect(canInvite('ADMIN', 'MEMBER')).toEqual({ allowed: true })
  })

  it('refuses a plain member and a non-member', () => {
    expect(canInvite('MEMBER', 'MEMBER')).toEqual({ allowed: false, reason: NOT_A_TEAM_KEEPER })
    expect(canInvite(null, 'MEMBER')).toEqual({ allowed: false, reason: NOT_A_TEAM_KEEPER })
  })
})

describe('canSetRole', () => {
  const base = {
    actorRole: 'OWNER' as const,
    actorUserId: OWNER,
    subjectUserId: MEMBER,
    subjectRole: 'MEMBER' as const,
    targetRole: 'ADMIN' as const,
    ownerCount: 1,
  }

  it('lets an owner promote a member', () => {
    expect(canSetRole(base)).toEqual({ allowed: true })
  })

  it('refuses demoting the last owner', () => {
    // An organisation with no owner has nobody who can promote anybody: live
    // data with no way back short of a database console.
    expect(
      canSetRole({
        ...base,
        subjectUserId: 'owner-2',
        subjectRole: 'OWNER',
        targetRole: 'MEMBER',
        ownerCount: 1,
      }),
    ).toEqual({ allowed: false, reason: LAST_OWNER })
  })

  it('allows demoting an owner once there is a second one', () => {
    expect(
      canSetRole({
        ...base,
        subjectUserId: 'owner-2',
        subjectRole: 'OWNER',
        targetRole: 'MEMBER',
        ownerCount: 2,
      }),
    ).toEqual({ allowed: true })
  })

  it('refuses changing your own role', () => {
    expect(canSetRole({ ...base, subjectUserId: OWNER, subjectRole: 'OWNER' })).toEqual({
      allowed: false,
      reason: CANNOT_CHANGE_OWN_ROLE,
    })
  })

  it('refuses an admin promoting anybody to owner', () => {
    expect(
      canSetRole({ ...base, actorRole: 'ADMIN', actorUserId: ADMIN, targetRole: 'OWNER' }),
    ).toEqual({ allowed: false, reason: CANNOT_GRANT_ABOVE_OWN_ROLE })
  })

  it('refuses an admin touching an owner or another admin', () => {
    expect(
      canSetRole({
        ...base,
        actorRole: 'ADMIN',
        actorUserId: ADMIN,
        subjectUserId: 'admin-2',
        subjectRole: 'ADMIN',
        targetRole: 'MEMBER',
      }),
    ).toEqual({ allowed: false, reason: ADMIN_CANNOT_TOUCH_KEEPER })
  })
})

describe('canRemoveMember', () => {
  const base = {
    actorRole: 'OWNER' as const,
    actorUserId: OWNER,
    subjectUserId: MEMBER,
    subjectRole: 'MEMBER' as const,
    ownerCount: 1,
  }

  it('lets an owner remove a member', () => {
    expect(canRemoveMember(base)).toEqual({ allowed: true })
  })

  it('refuses removing the last owner', () => {
    expect(
      canRemoveMember({ ...base, subjectUserId: 'owner-2', subjectRole: 'OWNER', ownerCount: 1 }),
    ).toEqual({ allowed: false, reason: LAST_OWNER })
  })

  it('refuses removing yourself', () => {
    expect(canRemoveMember({ ...base, subjectUserId: OWNER, subjectRole: 'OWNER' })).toEqual({
      allowed: false,
      reason: CANNOT_REMOVE_SELF,
    })
  })

  it('refuses an admin removing an owner', () => {
    expect(
      canRemoveMember({
        ...base,
        actorRole: 'ADMIN',
        actorUserId: ADMIN,
        subjectUserId: 'owner-2',
        subjectRole: 'OWNER',
        ownerCount: 2,
      }),
    ).toEqual({ allowed: false, reason: ADMIN_CANNOT_TOUCH_KEEPER })
  })
})

describe('canResetMemberPassword', () => {
  it('refuses an admin minting a link for an owner', () => {
    // A reset link IS the account, so being able to mint one for somebody is
    // being able to become them.
    expect(
      canResetMemberPassword({
        actorRole: 'ADMIN',
        actorUserId: ADMIN,
        subjectUserId: 'owner-2',
        subjectRole: 'OWNER',
      }),
    ).toEqual({ allowed: false, reason: ADMIN_CANNOT_TOUCH_KEEPER })
  })

  it('lets an owner mint one for a member', () => {
    expect(
      canResetMemberPassword({
        actorRole: 'OWNER',
        actorUserId: OWNER,
        subjectUserId: MEMBER,
        subjectRole: 'MEMBER',
      }),
    ).toEqual({ allowed: true })
  })

  it('points somebody at the public form for their own account', () => {
    const result = canResetMemberPassword({
      actorRole: 'OWNER',
      actorUserId: OWNER,
      subjectUserId: OWNER,
      subjectRole: 'OWNER',
    })
    expect(result.allowed).toBe(false)
  })
})

describe('an organisation can never end up with no owner', () => {
  // The invariant, checked over every arrangement rather than over the one
  // example somebody thought of.
  //
  // Three separate rules could each stop this: you cannot change your own role,
  // an admin cannot touch a keeper, and the last owner is protected. Any two of
  // them leave a hole, and the hole is only reachable through the third. So the
  // sweep below is run against every combination, and it is the reason the
  // last-owner rule stays even though the other two currently imply it: relaxing
  // either one must not silently make an ownerless organisation possible.
  const ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const
  const SOLE_OWNER = 'the-only-owner'

  it('refuses every way of removing the only owner', () => {
    for (const actorRole of ROLES) {
      for (const actorUserId of [SOLE_OWNER, 'somebody-else']) {
        const result = canRemoveMember({
          actorRole,
          actorUserId,
          subjectUserId: SOLE_OWNER,
          subjectRole: 'OWNER',
          ownerCount: 1,
        })
        expect(result.allowed, `${actorRole} as ${actorUserId} removed the only owner`).toBe(false)
      }
    }
  })

  it('refuses every way of demoting the only owner', () => {
    for (const actorRole of ROLES) {
      for (const actorUserId of [SOLE_OWNER, 'somebody-else']) {
        for (const targetRole of ['ADMIN', 'MEMBER'] as const) {
          const result = canSetRole({
            actorRole,
            actorUserId,
            subjectUserId: SOLE_OWNER,
            subjectRole: 'OWNER',
            targetRole,
            ownerCount: 1,
          })
          expect(
            result.allowed,
            `${actorRole} as ${actorUserId} demoted the only owner to ${targetRole}`,
          ).toBe(false)
        }
      }
    }
  })

  it('allows the same moves once a second owner exists', () => {
    // Guards the guard: if these were refused too, the sweeps above would pass
    // for a rule that simply forbids everything.
    expect(
      canRemoveMember({
        actorRole: 'OWNER',
        actorUserId: 'other-owner',
        subjectUserId: SOLE_OWNER,
        subjectRole: 'OWNER',
        ownerCount: 2,
      }),
    ).toEqual({ allowed: true })
    expect(
      canSetRole({
        actorRole: 'OWNER',
        actorUserId: 'other-owner',
        subjectUserId: SOLE_OWNER,
        subjectRole: 'OWNER',
        targetRole: 'MEMBER',
        ownerCount: 2,
      }),
    ).toEqual({ allowed: true })
  })
})

describe('every refusal', () => {
  it('names a person or a job, never a row id', () => {
    // `CLAUDE.md`: no raw internal id in anything a person reads.
    const messages = [
      NOT_A_TEAM_KEEPER,
      CANNOT_GRANT_ABOVE_OWN_ROLE,
      CANNOT_CHANGE_OWN_ROLE,
      CANNOT_REMOVE_SELF,
      LAST_OWNER,
      ADMIN_CANNOT_TOUCH_KEEPER,
    ]
    for (const message of messages) {
      expect(message).not.toMatch(/\b(c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4})\b/)
      expect(message).not.toMatch(/OWNER|ADMIN|MEMBER/)
      expect(message.length).toBeGreaterThan(20)
    }
  })
})
