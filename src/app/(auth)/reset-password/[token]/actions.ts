'use server'

// Setting a new password from a link.
//
// Only the local channel reaches this page. An account that lives in Identity
// Platform gets Identity Platform's own reset mail and never comes back here, so
// what this handles is the two cases that are ours: an account that predates the
// switch, and a link an owner minted for a team member during a beta with no
// mail provider.
//
// Completing one of these is also the moment a legacy account moves across:
// `completePasswordReset` writes the new password to Identity Platform and nulls
// the local hash. Nobody is asked to reset on a deadline; the old column drains
// as people use the product.

import { headers } from 'next/headers'
import { AuthError } from 'next-auth'
import { z } from 'zod'

import { signIn } from '@/lib/auth'
import { AUTH_MESSAGES, safeAuthFailure } from '@/modules/auth/errors'
import { consumeTokenAttempt } from '@/modules/auth/rate-limit'
import { authClientIpBucket } from '@/modules/auth/request-ip'
import { dispatchCommand } from '@/modules/commands/dispatch'

export type ResetPasswordFormResult = { ok: true } | { ok: false; error: string }

const ANONYMOUS = 'anonymous'

const formSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(1).max(512),
})

const THROTTLED =
  'Too many attempts from this connection. Please wait a few minutes and try again.'

export async function resetPasswordAction(formData: FormData): Promise<ResetPasswordFormResult> {
  const parsed = formSchema.safeParse({
    token: String(formData.get('token') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
  if (!parsed.success) return { ok: false, error: 'Please check the details and try again.' }
  const { token, password } = parsed.data

  try {
    const ipBucket = authClientIpBucket(await headers())
    const gate = await consumeTokenAttempt(ipBucket)
    if (!gate.allowed) return { ok: false, error: THROTTLED }
  } catch (err) {
    return { ok: false, error: safeAuthFailure(err, 'reset.gate').message }
  }

  // No organisation on the context: a password belongs to a person, not to a
  // team, and inventing an org for the audit row would file it under whichever
  // membership happened to sort first. The command carries `redactForAudit`, so
  // the row keeps sha256 of the link and nothing of the password.
  const result = await dispatchCommand<{ email: string }>(
    'auth.password.reset',
    { token, password },
    { userId: ANONYMOUS, orgId: ANONYMOUS },
  )
  if (!result.ok) return { ok: false, error: result.error }

  // Signed straight in: they have proved control of the mailbox and just chosen
  // the password, so a login form asking for it again is friction with no
  // security in it.
  try {
    await signIn('credentials', {
      email: result.data.email,
      password,
      redirectTo: '/dashboard',
    })
    return { ok: true }
  } catch (err) {
    if (!(err instanceof AuthError)) throw err
    return { ok: false, error: `Your password is set. ${AUTH_MESSAGES.signInUnavailable}` }
  }
}
