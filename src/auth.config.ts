// Edge-runtime-safe auth config. Used by `src/middleware.ts`.
// No DB/bcrypt imports — those live in `src/lib/auth.ts` which extends this.
import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
} satisfies NextAuthConfig
