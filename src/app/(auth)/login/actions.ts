'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'

export type LoginResult = { ok: true } | { ok: false; error: string }

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/dashboard') || '/dashboard'

  if (!email || !password) {
    return { ok: false, error: 'Email and password are required' }
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: next,
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof AuthError) {
      const message =
        err.type === 'CredentialsSignin' ? 'Invalid email or password' : 'Could not sign in'
      return { ok: false, error: message }
    }
    throw err
  }
}
