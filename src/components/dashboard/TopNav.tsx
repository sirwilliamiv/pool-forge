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

  return (
    <header className="border-b bg-background">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Pool Forge
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/settings/price-book" className="text-muted-foreground hover:text-foreground">
              Price book
            </Link>
            <Link href="/settings/intake" className="text-muted-foreground hover:text-foreground">
              Customer uploads
            </Link>
            <Link href="/settings/company" className="text-muted-foreground hover:text-foreground">
              Company
            </Link>
            <Link href="/settings/team" className="text-muted-foreground hover:text-foreground">
              Team
            </Link>
            <Link href="/docs/tools" className="text-muted-foreground hover:text-foreground">
              Docs
            </Link>
          </nav>
        </div>

        <AccountMenu userLabel={userLabel} logout={logoutAction} />
      </div>
    </header>
  )
}
