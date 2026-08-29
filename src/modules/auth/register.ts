// Public registration is closed.
//
// This module used to create a `User`, an `Organization` and an OWNER membership
// for anybody who filled in a form. Pool Forge is going out to a handful of
// chosen builders, so that door is shut: the only way a `User` row comes into
// existence now is `modules/invites/invites.ts#acceptInvite`, which requires a
// single-use link somebody with a role issued.
//
// WHY THIS FILE STILL EXISTS
//
// Deleting it would have been tidier and worse. `registerUser` was reachable as
// a server action in its own right, which is exactly why the previous pass put
// the rate-limit ceiling on the route rather than in here. A file that is gone
// cannot refuse anything, whereas this one is a single closed door that every
// old call site, every stale import and every bundled action reference now runs
// into. When the last of those is gone, so is this.
//
// It creates nothing, it touches no table, and it answers the same way for every
// input. In particular it does NOT say whether the address already has an
// account: the old implementation returned "an account with that email already
// exists", which was an enumeration oracle that the throttle only made
// expensive rather than closing.

import { z } from 'zod'

/**
 * Kept so old imports still type-check. Nothing validates against it any more,
 * and nothing should: there is no self-service registration input.
 */
export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(120).optional(),
  orgName: z.string().min(1).max(120).optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>

export type RegisterResult =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: string }

/** What anybody trying to sign themselves up is told. */
export const REGISTRATION_CLOSED =
  'Pool Forge is invite only at the moment. Ask whoever told you about it for an invite, ' +
  'and check your inbox for a link.'

/**
 * Always refuses.
 *
 * Not `throw`, because a throw from a server action reaches a customer as the
 * error boundary, and "the app crashed" is not what "we are invite only" should
 * look like. Not conditional on any input either: an answer that varied would be
 * something to probe.
 */
export async function registerUser(_input: RegisterInput): Promise<RegisterResult> {
  return { ok: false, error: REGISTRATION_CLOSED }
}
