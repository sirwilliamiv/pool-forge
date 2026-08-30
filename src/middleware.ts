import { NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

const { auth } = NextAuth(authConfig)

const PROTECTED_PREFIXES = ['/dashboard', '/projects', '/settings']

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default auth((req) => {
  const { pathname } = req.nextUrl

  // The apex is the marketing site's home. Until that site exists its mapping
  // still points here, so send visitors to the app's canonical origin rather
  // than serving the app on two hostnames with split cookies.
  const host = req.headers.get('host') ?? ''
  if (host === 'pool-forge.com' || host === 'www.pool-forge.com') {
    const url = req.nextUrl.clone()
    url.protocol = 'https'
    url.host = 'app.pool-forge.com'
    url.port = ''
    return NextResponse.redirect(url, 308)
  }

  if (!isProtected(pathname)) return NextResponse.next()
  if (req.auth) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)'],
}
