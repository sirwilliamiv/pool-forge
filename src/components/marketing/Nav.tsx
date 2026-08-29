'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { MARKETING_PAGES } from './pages'
import { Mark } from './Mark'

// Fixed, 72px, white, no blur, one hairline at the bottom. Mark on the left,
// the primary call to action on the right, and the section links in between.
//
// Client only because the current page gets `aria-current`, which a screen
// reader announces and the underline states visually. Nothing else here needs
// the browser.

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="mk-nav">
      <nav className="mk-shell mk-nav__inner" aria-label="Primary">
        <Link href="/request-access" className="mk-mark" aria-label="Pool Forge, home">
          <Mark />
          Pool Forge
        </Link>

        <ul className="mk-nav__links">
          {MARKETING_PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="mk-nav__link"
                {...(pathname === page.href ? { 'aria-current': 'page' as const } : {})}
              >
                {page.nav}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mk-nav__end">
          <Link href="/login" className="mk-nav__link">
            Sign in
          </Link>
          <Link href="/request-access" className="mk-btn mk-btn--primary">
            Request access
          </Link>
        </div>
      </nav>
    </header>
  )
}
