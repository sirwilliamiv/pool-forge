import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'
import { AccountMenu } from './AccountMenu'
import { NavLinks } from './NavLinks'

async function logoutAction() {
  'use server'
  await signOut({ redirectTo: '/login' })
}

export async function TopNav() {
  const session = await auth()
  const userLabel = session?.user?.email ?? 'Account'

  return (
    <header className="border-b border-theme-line bg-theme-bg">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-bodyL font-semibold tracking-[-0.04125rem] text-theme-fg"
          >
            Pool Forge
          </Link>
          <NavLinks />
        </div>

        <AccountMenu userLabel={userLabel} logout={logoutAction} />
      </div>
    </header>
  )
}
