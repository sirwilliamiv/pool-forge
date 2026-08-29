'use server'

// The old self-service sign-up action, closed.
//
// Pool Forge is invite only. This used to spend a per-address ceiling, create a
// User, an Organization and an OWNER membership, and then sign the person in.
// All of that is gone: accounts come from `team.invite.accept` and nowhere else.
//
// The export stays because a `'use server'` export is an independently callable
// endpoint whether or not any page still renders a form at it. A browser that
// has an old bundle cached, or anybody who ever recorded the action id, can
// still POST here, so the honest thing is a door that is shut rather than a file
// that is missing and a route that 404s only until somebody restores the page.
//
// Nothing is looked up and nothing is written, so there is no ceiling to spend
// and nothing to enumerate: the answer is a constant. That is a deliberate
// downgrade from the throttle that was here, and it is safe precisely because
// the endpoint no longer reads or writes anything.

import { REGISTRATION_CLOSED } from '@/modules/auth/register'

export type RegisterFormResult = { ok: true } | { ok: false; error: string }

export async function registerAction(_formData: FormData): Promise<RegisterFormResult> {
  return { ok: false, error: REGISTRATION_CLOSED }
}
