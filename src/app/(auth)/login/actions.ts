'use server'

import { headers } from 'next/headers'
import { AuthError } from 'next-auth'
import { z } from 'zod'
import { signIn } from '@/lib/auth'
import { AUTH_MESSAGES, LOGIN_RATE_LIMITED_CODE, safeAuthFailure } from '@/modules/auth/errors'
import { isLoginRateLimited } from '@/modules/auth/rate-limit'
import { authClientIpBucket } from '@/modules/auth/request-ip'

export type LoginResult = { ok: true } | { ok: false; error: string }

/**
 * The form's own boundary schema. `next` is bounded to a same-site path: it is
 * attacker-supplied text that becomes a redirect target, and an absolute URL
 * here would turn the sign-in page into an open redirect.
 */
const loginFormSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(512),
  next: z
    .string()
    .trim()
    .refine((value) => value.startsWith('/') && !value.startsWith('//'), 'relative path required')
    .catch('/dashboard'),
})

/**
 * The throttle is NOT enforced here. It is enforced inside `authorize`, because
 * this action is not the only way in: anyone can POST straight at
 * `/api/auth/callback/credentials` and never load this page. A guard on the form
 * would be a guard on the one path an attacker has no reason to use. What
 * happens here is presentational only, deciding which sentence to show once the
 * attempt has already been counted and refused.
 */
export async function loginAction(formData: FormData): Promise<LoginResult> {
  const parsed = loginFormSchema.safeParse({
    email: formData.get('email') ?? '',
    password: formData.get('password') ?? '',
    next: formData.get('next') ?? '/dashboard',
  })
  if (!parsed.success) {
    // Same string as a wrong password. A distinct "email is required" would be
    // harmless, but a distinct "that is not a valid email" starts describing the
    // server's opinion of the input, and there is no reason to differentiate.
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials }
  }
  const { email, password, next } = parsed.data

  try {
    await signIn('credentials', { email, password, redirectTo: next })
    return { ok: true }
  } catch (err) {
    // `signIn` signals success by throwing NEXT_REDIRECT. Anything that is not
    // an AuthError has to keep going or the redirect never happens.
    if (!(err instanceof AuthError)) throw err

    const code = (err as { code?: unknown }).code
    if (code === LOGIN_RATE_LIMITED_CODE) {
      return { ok: false, error: AUTH_MESSAGES.loginThrottled }
    }

    if (err.type === 'CredentialsSignin') {
      // The attempt was counted and rejected. Ask the counters whether the NEXT
      // attempt would be refused too, so somebody who has just used up their
      // last try is told to wait instead of being invited to keep guessing at a
      // form that will refuse them silently.
      //
      // Deliberately not fatal: this is a SELECT for copy, and a database hiccup
      // here must not turn a wrong password into a server error.
      try {
        const ipBucket = authClientIpBucket(await headers())
        if (await isLoginRateLimited(ipBucket, email)) {
          return { ok: false, error: AUTH_MESSAGES.loginThrottled }
        }
      } catch (peekErr) {
        safeAuthFailure(peekErr, 'login.peek')
      }
      return { ok: false, error: AUTH_MESSAGES.invalidCredentials }
    }

    // Configuration faults, callback faults, anything else: the raw message can
    // name a provider, a URL, or a stack, so it is logged scrubbed and the
    // caller gets a ref.
    return { ok: false, error: safeAuthFailure(err, 'login.signIn').message }
  }
}
