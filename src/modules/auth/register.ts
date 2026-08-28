// Deliberately NOT a `'use server'` module.
//
// It used to be, and that was two problems in one line. Next refuses a
// `'use server'` file that exports anything other than an async function, and
// this one exports `registerSchema`, so every submission of the sign-up form
// died with "A 'use server' file can only export async functions, found object"
// and the customer saw the crash boundary. The second problem is the reason not
// to fix it by moving the schema out: every export of a `'use server'` module
// becomes an independently callable server action, so `registerUser` was a
// second way into account creation that the throttle on `registerAction` did not
// cover. Registration is reached through the action in
// `app/(auth)/register/actions.ts`, which is where the ceiling is spent.

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { safeAuthFailure } from './errors'

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

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Invalid input' }
  }
  const { email, password, name, orgName } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)
  const resolvedOrgName = orgName?.trim() || (name ? `${name}'s Org` : `${email.split('@')[0]}'s Org`)

  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, name: name ?? null },
        select: { id: true },
      })
      const org = await tx.organization.create({
        data: { name: resolvedOrgName },
        select: { id: true },
      })
      await tx.organizationMember.create({
        data: { userId: user.id, orgId: org.id, role: 'OWNER' },
      })
      return { userId: user.id, orgId: org.id }
    })
    return { ok: true, ...result }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, error: 'An account with that email already exists' }
    }
    // Anything else is a server fault: a Prisma message, a connection string, a
    // constraint name. Logged scrubbed against a ref; the caller gets the ref.
    return { ok: false, error: safeAuthFailure(err, 'register.create', 'registerUnavailable').message }
  }
}
