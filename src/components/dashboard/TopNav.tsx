import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'
import { AccountMenu } from './AccountMenu'

async function logoutAction() {
  'use server'
  await signOut({ redirectTo: '/login' })
}

export async function TopNav() {
  const session = await auth()
  const userLabel = session?.user?.email ?? 'Account'

  const navLink = 'text-bodyL text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg'

  return (
    <header className="border-b border-theme-line bg-theme-bg">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-bodyL font-semibold text-theme-fg">
            Pool Forge
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/dashboard" className={navLink}>
              Dashboard
            </Link>
            <Link href="/settings/price-book" className={navLink}>
              Price book
            </Link>
            <Link href="/settings/intake" className={navLink}>
              Customer uploads
            </Link>
            <Link href="/settings/company" className={navLink}>
              Company
            </Link>
            <Link href="/settings/team" className={navLink}>
              Team
            </Link>
            <Link href="/docs/tools" className={navLink}>
              Docs
            </Link>
          </nav>
        </div>

        <AccountMenu userLabel={userLabel} logout={logoutAction} />
      </div>
    </header>
  )
}
