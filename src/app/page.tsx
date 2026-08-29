import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'

/**
 * The front door.
 *
 * Signed in, you want the work. Signed out, you want to know what this is, and
 * for a long time the answer was a sign-in box: a builder who typed the domain
 * got a password field and no explanation of what they were signing into, while
 * the page that explains it sat at a URL nothing linked to.
 *
 * A redirect rather than rendering the marketing page here, because that page
 * lives in the `(marketing)` route group and depends on its layout. Serving its
 * component from this route would quietly drop the layout and the chrome that
 * comes with it, which is a worse bug than an extra hop.
 */
export default async function HomePage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')
  redirect('/request-access')
}
