'use server'

// Redeeming an invite.
//
// The token arrives in the URL, so it arrives in the browser history, in any
// proxy log that records paths, and in the `Referer` of whatever the page loads
// next. That is unavoidable for a link somebody clicks in an email, and it is
// why the thing has a one-week life, one use, and no power beyond joining one
// organisation. What it must never additionally do is end up in this product's
// own records: the command it dispatches carries `redactForAudit`, so the audit
// row keeps sha256 of the link and nothing of the password.

import { headers } from 'next/headers'
import { AuthError } from 'next-auth'
import { z } from 'zod'

import { db } from '@/lib/db'
import { signIn } from '@/lib/auth'
import { AUTH_MESSAGES, safeAuthFailure } from '@/modules/auth/errors'
import { consumeTokenAttempt } from '@/modules/auth/rate-limit'
import { authClientIpBucket } from '@/modules/auth/request-ip'
import { inspectToken } from '@/modules/auth/tokens'
import { dispatchCommand } from '@/modules/commands/dispatch'

export type AcceptInviteFormResult =
  | { ok: true; signedIn: boolean; orgName: string }
  | { ok: false; error: string }

const ANONYMOUS = 'anonymous'

const formSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(1).max(512),
  name: z.string().trim().max(120).optional(),
})

const THROTTLED =
  'Too many attempts from this connection. Please wait a few minutes and try again.'

interface AcceptData {
  outcome: 'created' | 'joined' | 'already-member'
  email: string
  orgName: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  userId: string
}

export async function acceptInviteAction(formData: FormData): Promise<AcceptInviteFormResult> {
  const nameField = String(formData.get('name') ?? '').trim()
  const parsed = formSchema.safeParse({
    token: String(formData.get('token') ?? ''),
    password: String(formData.get('password') ?? ''),
    ...(nameField.length > 0 ? { name: nameField } : {}),
  })
  if (!parsed.success) {
    return { ok: false, error: 'Please check the details and try again.' }
  }
  const { token, password, name } = parsed.data

  // Fail closed. If the counter cannot be written the ceiling is not being
  // enforced, and an unenforced ceiling on the one unauthenticated endpoint that
  // creates accounts is worse than a page that is briefly unavailable.
  try {
    const ipBucket = authClientIpBucket(await headers())
    const gate = await consumeTokenAttempt(ipBucket)
    if (!gate.allowed) return { ok: false, error: THROTTLED }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'invite.gate', 'registerUnavailable').message }
  }

  // Read the organisation off the invite so the audit row lands on the right
  // team. Done here rather than inside the command because `CommandContext` is
  // fixed at dispatch, and a membership change with a null org in the log is a
  // membership change nobody can find later. Reading does not spend the link.
  let orgId = ANONYMOUS
  try {
    const inspected = await inspectToken(db, 'INVITE', token)
    if (inspected.ok && inspected.token.orgId) orgId = inspected.token.orgId
  } catch {
    // Not fatal. The command re-reads the token itself and will refuse properly;
    // all that is lost is which organisation the audit row is filed under.
  }

  const input: { token: string; password: string; name?: string } = { token, password }
  if (name !== undefined) input.name = name

  const result = await dispatchCommand<AcceptData>('team.invite.accept', input, {
    userId: ANONYMOUS,
    orgId,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const accepted = result.data

  // Signed straight in. They have just proved control of the mailbox the invite
  // went to AND supplied the password for the account, which is strictly more
  // than the sign-in page asks for. Bouncing them to a login form to type the
  // same password again is the step at which people in a beta give up.
  try {
    await signIn('credentials', {
      email: accepted.email,
      password,
      redirectTo: '/dashboard',
    })
    return { ok: true, signedIn: true, orgName: accepted.orgName }
  } catch (err) {
    // `signIn` signals success by throwing NEXT_REDIRECT, so anything that is
    // not an AuthError has to keep going or the redirect never happens.
    if (!(err instanceof AuthError)) throw err
    return {
      ok: false,
      error: `You are on the team at ${accepted.orgName}. ${AUTH_MESSAGES.signInUnavailable}`,
    }
  }
}
