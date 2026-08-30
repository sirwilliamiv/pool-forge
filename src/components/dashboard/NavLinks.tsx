'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The section links, split out of `TopNav` because knowing which page you are
// on needs `usePathname`, and `TopNav` has to stay a server component to reach
// the session and the sign-out action.
//
// Two states, doing two different jobs:
//
//   hover    fills with one of the core hues. Each section keeps its own, so
//            the colour is a property of the place rather than a generic
//            highlight, and running along the bar walks the spectrum.
//
//   current  an outline in ink, no fill. Where you are is a fact and should not
//            depend on colour to read: it survives being the same hue as the
//            thing you happen to be hovering, and it survives colour blindness.
//
// The ink is per hue rather than one rule for all of them. These are the
// saturated colours, not the tints — black fails on the purple and white fails
// on the other four.

interface NavItem {
  href: string
  label: string
  /** Everything under this prefix counts as being on this section. */
  match: string
  hover: string
  ink: string
}

const LINKS: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    match: '/dashboard',
    hover: 'var(--brand-orange)',
    ink: 'var(--ink-black)',
  },
  {
    href: '/settings/price-book',
    label: 'Price book',
    match: '/settings/price-book',
    hover: 'var(--brand-red)',
    ink: 'var(--ink-black)',
  },
  {
    href: '/settings/intake',
    label: 'Customer uploads',
    match: '/settings/intake',
    hover: 'var(--brand-purple)',
    ink: 'var(--ink-white)',
  },
  {
    href: '/settings/company',
    label: 'Company',
    match: '/settings/company',
    hover: 'var(--brand-blue)',
    ink: 'var(--ink-black)',
  },
  {
    href: '/settings/team',
    label: 'Team',
    match: '/settings/team',
    hover: 'var(--brand-green)',
    ink: 'var(--ink-black)',
  },
  {
    href: '/docs/tools',
    label: 'Docs',
    match: '/docs',
    hover: 'var(--brand-ui-blue)',
    ink: 'var(--ink-black)',
  },
]

function isCurrent(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`)
}

export function NavLinks() {
  const pathname = usePathname() ?? ''

  return (
    <nav className="flex items-center gap-1" aria-label="Sections">
      {LINKS.map((item) => {
        const current = isCurrent(pathname, item.match)
        return (
          <Link
            key={item.href}
            href={item.href}
            {...(current ? { 'aria-current': 'page' as const } : {})}
            style={
              {
                '--nav-hover': item.hover,
                '--nav-ink': item.ink,
              } as React.CSSProperties
            }
            className={[
              'rounded-brand px-3 py-1.5 text-bodyL whitespace-nowrap',
              'transition-[background,color,box-shadow] duration-brand ease-brand',
              'hover:bg-[var(--nav-hover)] hover:text-[var(--nav-ink)]',
              current
                ? 'text-theme-fg shadow-[inset_0_0_0_1px_var(--theme-fg)]'
                : 'text-theme-muted',
            ].join(' ')}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
