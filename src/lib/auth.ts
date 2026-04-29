// Auth.js v5 entry point. Track B finalizes the configuration.
// This file is intentionally minimal so other modules can import { auth } early.

import NextAuth from 'next-auth'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
})
