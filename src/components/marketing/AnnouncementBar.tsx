'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The one full-bleed colour in the system, and the only client component on
// these pages: it can be dismissed, and a dismissal that does not stick is
// worse than no dismiss button at all.
//
// The choice is remembered per browser and never leaves it. A read that throws
// (private window, site data blocked, a thumbnail capture) must render the bar
// rather than crash the page, which is why both halves are wrapped.

const STORAGE_KEY = 'pf.marketing.announce.dismissed'

/**
 * Where the bar has nothing to say, because the reader is already there.
 *
 * Everything the bar does is send somebody to `/request-access`. Showing it on
 * that page is a banner asking you to go where you are standing, and it puts a
 * second "invite only while it is early" on a page that already says it in the
 * headline.
 */
const SILENT_ON = ['/request-access']

export function AnnouncementBar() {
  const pathname = usePathname()
  // Rendered hidden on the server and on the first client paint, then revealed
  // once storage has been read. Otherwise a returning visitor sees the bar flash
  // in and disappear.
  const [state, setState] = React.useState<'unknown' | 'show' | 'hide'>('unknown')

  React.useEffect(() => {
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      dismissed = false
    }
    setState(dismissed ? 'hide' : 'show')
  }, [])

  if (state !== 'show') return null
  if (SILENT_ON.includes(pathname)) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // A browser that will not store the choice still gets to make it for
      // this page view.
    }
    setState('hide')
  }

  return (
    <aside className="mk-announce" aria-label="Announcement">
      <div className="mk-shell mk-announce__inner">
        <p className="mk-announce__text">
          Pool Forge is invite only while it is early. Tell us about your business and we
          will open a seat.
        </p>
        <Link href="/request-access" className="mk-announce__cta">
          Request access
        </Link>
        <button
          type="button"
          className="mk-announce__dismiss"
          onClick={dismiss}
          aria-label="Dismiss announcement"
        >
          ×
        </button>
      </div>
    </aside>
  )
}
