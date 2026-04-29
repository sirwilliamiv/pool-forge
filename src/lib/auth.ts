import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import 'next-auth/jwt'
// TODO(Google OAuth): uncomment when ready to enable. Requires GOOGLE_CLIENT_ID
// and GOOGLE_CLIENT_SECRET in env, and these redirect URIs configured in the
// Google Cloud Console:
//   - http://localhost:3000/api/auth/callback/google
//   - https://<production-host>/api/auth/callback/google
// import Google from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'

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
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data
        const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
        if (!user) return null
        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null
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
