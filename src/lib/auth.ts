import NextAuth, { CredentialsSignin, type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import 'next-auth/jwt'
// TODO(Google OAuth): uncomment when ready to enable. Requires GOOGLE_CLIENT_ID
// and GOOGLE_CLIENT_SECRET in env, and these redirect URIs configured in the
// Google Cloud Console:
//   - http://localhost:3000/api/auth/callback/google
//   - https://<production-host>/api/auth/callback/google
// import Google from 'next-auth/providers/google'
import { z } from 'zod'
import { db } from '@/lib/db'
import { LOGIN_RATE_LIMITED_CODE } from '@/modules/auth/errors'
import { verifyCredentialPassword } from '@/modules/auth/password'
import { authClientIpBucket } from '@/modules/auth/request-ip'
import { clearLoginAttempts, consumeLoginAttempt } from '@/modules/auth/rate-limit'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      orgId: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    orgId?: string | null
  }
}

/**
 * Thrown by `authorize` when a ceiling refuses the attempt.
 *
 * Extends `CredentialsSignin`, so Auth.js treats it as an ordinary failed
 * sign-in and surfaces `code` rather than a 500 with a stack. The sign-in form
 * reads that code to choose its copy; nothing about the code reaches the
 * browser's URL beyond the same `CredentialsSignin` every wrong password
 * produces, so it does not tell an attacker anything a stopwatch would not.
 */
export class LoginRateLimited extends CredentialsSignin {
  code = LOGIN_RATE_LIMITED_CODE
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

async function loadPrimaryOrgId(userId: string): Promise<string | null> {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    orderBy: { id: 'asc' },
    select: { orgId: true },
  })
  return membership?.orgId ?? null
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data
        const normalizedEmail = email.toLowerCase()

        // One `now` for the whole attempt. The refund on success has to land in
        // the same fixed window the consume did, and an attempt that straddles a
        // window boundary would otherwise refund a bucket it never charged.
        const now = new Date()
        const ipBucket = authClientIpBucket(request?.headers ?? new Headers())

        // Spent BEFORE the user lookup, so an attempt costs the same whether the
        // address exists or not. Ordering it after the lookup would make the
        // limiter itself an enumeration oracle: unknown addresses would stay
        // cheap forever while real ones started refusing.
        const gate = await consumeLoginAttempt(ipBucket, normalizedEmail, now)
        if (!gate.allowed) throw new LoginRateLimited()

        const user = await db.user.findUnique({ where: { email: normalizedEmail } })

        // Verified through a helper that hashes even when there is no account:
        // an early return here is a timing oracle answering "does this builder
        // have an account" without anyone having to guess a password.
        const ok = await verifyCredentialPassword(user?.passwordHash ?? null, password)
        if (!user || !ok) return null

        // Correct password: refund the address bucket and drop this account's two
        // buckets. A builder who fumbled four times and then got in is not left
        // carrying four strikes.
        await clearLoginAttempts(ipBucket, normalizedEmail, now)
        return { id: user.id, email: user.email, name: user.name ?? null }
      },
    }),
    // TODO(Google OAuth): see comment at top of file before enabling.
    // Google({
    //   clientId: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    //   allowDangerousEmailAccountLinking: false,
    // }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id
        token.orgId = await loadPrimaryOrgId(user.id)
      } else if (token.userId && token.orgId === undefined) {
        token.orgId = await loadPrimaryOrgId(token.userId)
      }
      return token
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId
        session.user.orgId = token.orgId ?? null
      }
      return session
    },
  },
})
