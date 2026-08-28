'use server'

import { headers } from 'next/headers'
import { AuthError } from 'next-auth'
import { z } from 'zod'
import { signIn } from '@/lib/auth'
import { AUTH_MESSAGES, safeAuthFailure } from '@/modules/auth/errors'
import { consumeRegisterAttempt } from '@/modules/auth/rate-limit'
import { authClientIpBucket } from '@/modules/auth/request-ip'
import { registerUser } from '@/modules/auth/register'

export type RegisterFormResult = { ok: true } | { ok: false; error: string }

const registerFormSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(512),
  name: z.string().trim().max(120).optional(),
  orgName: z.string().trim().max(120).optional(),
})

function optionalField(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : undefined
}

/**
 * Registration is throttled for two reasons that happen to want the same
 * ceiling. It answers "is this email already taken", which is an enumeration
 * oracle whatever the wording, and each call writes a User, an Organization, and
 * a membership, which is a way to fill the database from outside.
 *
 * Successes count as well as failures: five new organizations an hour from one
 * address is already generous for a product sold to pool builders, and refunding
 * successes would let a script alternate real signups with probes.
 *
 * Unlike sign-in, this action IS the enforcement point. There is no framework
 * endpoint behind it; `registerUser` is reachable as a server action in its own
 * right, which is noted in the report rather than papered over here, because a
 * `headers()` call inside a domain module would break every caller that is not
 * an HTTP request.
 */
export async function registerAction(formData: FormData): Promise<RegisterFormResult> {
  const parsed = registerFormSchema.safeParse({
    email: formData.get('email') ?? '',
    password: formData.get('password') ?? '',
    name: optionalField(formData.get('name')),
    orgName: optionalField(formData.get('orgName')),
  })
  if (!parsed.success) {
    return { ok: false, error: 'Please check the details and try again.' }
  }
  const { email, password, name, orgName } = parsed.data

  try {
    const ipBucket = authClientIpBucket(await headers())
    const gate = await consumeRegisterAttempt(ipBucket)
    if (!gate.allowed) return { ok: false, error: AUTH_MESSAGES.registerThrottled }
  } catch (err) {
    // Fail closed. If the counter cannot be written, the ceiling is not being
    // enforced, and an unenforced ceiling on the one endpoint that creates rows
    // from outside is worse than a signup page that is briefly unavailable.
    return { ok: false, error: safeAuthFailure(err, 'register.gate', 'registerUnavailable').message }
  }

  const input: { email: string; password: string; name?: string; orgName?: string } = {
    email,
    password,
  }
  if (name !== undefined) input.name = name
  if (orgName !== undefined) input.orgName = orgName

  const result = await registerUser(input)
  if (!result.ok) return { ok: false, error: result.error }

  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' })
    return { ok: true }
  } catch (err) {
    if (!(err instanceof AuthError)) throw err
    return { ok: false, error: 'Account created. Please sign in.' }
  }
}
