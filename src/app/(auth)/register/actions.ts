'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { registerUser } from '@/modules/auth/register'

export type RegisterFormResult = { ok: true } | { ok: false; error: string }

export async function registerAction(formData: FormData): Promise<RegisterFormResult> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const nameRaw = String(formData.get('name') ?? '').trim()
  const orgNameRaw = String(formData.get('orgName') ?? '').trim()

  const input: {
    email: string
    password: string
    name?: string
    orgName?: string
  } = { email, password }
  if (nameRaw) input.name = nameRaw
  if (orgNameRaw) input.orgName = orgNameRaw

  const result = await registerUser(input)
  if (!result.ok) return { ok: false, error: result.error }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: 'Account created. Please sign in.' }
    }
    throw err
  }
}
