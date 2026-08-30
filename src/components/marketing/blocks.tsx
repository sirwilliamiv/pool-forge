import type { ReactNode } from 'react'
import Link from 'next/link'

import { Mark } from './Mark'
import { otherPages } from './pages'

// The furniture every one of the three pages is built from.
//
// Per the brand bible's house rules, a new page gets an accent family and
// nothing else: same layout system, same button, same type scale. So these
// components take content and never take styling, and the only thing that
// differs between the three pages is the `data-accent` attribute on the root.

/* --------------------------------------------------------------- the hero */

/**
 * The one orchestrated moment on the page. The stage pins for a viewport while
 * the page scrolls under it; the accent shapes fly in from the crop edges and
 * the plate rises into place behind them. Below this, nothing moves.
 */
export function Hero({
  eyebrow,
  headline,
  lead,
  shapes,
  plate,
}: {
  eyebrow: string
  headline: ReactNode
  lead: string
  shapes: ReactNode
  plate: ReactNode
}) {
  return (
    <section className="mk-hero">
      <div className="mk-hero__stage">
        <div className="mk-shapes" aria-hidden>
          <span className="mk-hero__tint" />
          {shapes}
        </div>

        <div className="mk-shell mk-hero__layout">
          <div className="mk-hero__head mk-anim-head">
            <p className="mk-hero__eyebrow mk-label mk-label--ink">
              <span className="mk-fan" aria-hidden />
              {eyebrow}
            </p>
            <h1 className="mk-display1">{headline}</h1>
            <p className="mk-hero__lead mk-lead">{lead}</p>
            <div className="mk-hero__actions">
              <Link href="/request-access" className="mk-btn mk-btn--primary">
                Request access
              </Link>
              <Link href="/login" className="mk-btn mk-btn--secondary">
                Sign in
              </Link>
            </div>
          </div>

          <div className="mk-hero__plate mk-anim-plate">{plate}</div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- a section */

export function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string
  title: string
  lead?: string
}) {
  return (
    <div className="mk-sectionhead">
      <p className="mk-sectionhead__eyebrow mk-label mk-label--ink">
        <span className="mk-fan" aria-hidden />
        {eyebrow}
      </p>
      <h2 className="mk-title1">{title}</h2>
      {lead ? <p className="mk-sectionhead__lead mk-lead">{lead}</p> : null}
    </div>
  )
}

export interface FeatureCell {
  title: string
  body: string
  /** Mono metadata: a count, a unit, a document name. Never a sentence. */
  meta?: string
}

/**
 * Cells on a hairline grid.
 *
 * `columns` must divide `cells.length` exactly at the widest breakpoint, and
 * both must be even so the two-column layout fills as well. An empty track in
 * the last row is not blank space: the hairline is the grid's own background
 * showing through the gaps, so a short row renders as a grey block.
 */
export function FeatureGrid({
  cells,
  columns = 4,
}: {
  cells: readonly FeatureCell[]
  columns?: 3 | 4
}) {
  return (
    <ul className={`mk-grid mk-grid--${columns}`}>
      {cells.map((cell) => (
        <li key={cell.title} className="mk-cell">
          <h3 className="mk-cell__title">{cell.title}</h3>
          <p className="mk-cell__body">{cell.body}</p>
          {cell.meta ? <p className="mk-cell__meta mk-label">{cell.meta}</p> : null}
        </li>
      ))}
    </ul>
  )
}

/** Prose on one side, a drawn plate on the other. */
export function Split({
  flip = false,
  children,
}: {
  flip?: boolean
  children: ReactNode
}) {
  return <div className={flip ? 'mk-split mk-split--flip' : 'mk-split'}>{children}</div>
}

export function PointList({
  points,
}: {
  points: readonly { lead: string; rest: string }[]
}) {
  return (
    <ul className="mk-list">
      {points.map((point) => (
        <li key={point.lead} className="mk-list__item">
          <span className="mk-list__dot" aria-hidden />
          <p className="mk-list__text">
            <strong>{point.lead}</strong> {point.rest}
          </p>
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------- read next / foot */

export function ReadNext({ currentHref }: { currentHref: string }) {
  return (
    <nav className="mk-next" aria-label="More about Pool Forge">
      {otherPages(currentHref).map((page) => (
        <Link key={page.href} href={page.href} className="mk-next__card">
          <span className="mk-label">Read next</span>
          <span className="mk-title3">{page.title}</span>
          <span className="mk-caption">{page.blurb}</span>
        </Link>
      ))}
    </nav>
  )
}

export function Footer() {
  return (
    <footer className="mk-footer">
      <div className="mk-shell">
        <div className="mk-footer__inner">
          <div className="mk-footer__col">
            <span className="mk-mark">
              <Mark />
              Pool Forge
            </span>
            <p className="mk-caption" style={{ maxWidth: '22rem' }}>
              Draw the pool. Price the job. Export the proposal. Estimating software for
              the people who build them.
            </p>
          </div>

          <div className="mk-footer__col">
            <span className="mk-label">Product</span>
            {otherPages('').map((page) => (
              <Link key={page.href} href={page.href} className="mk-footer__link">
                {page.title}
              </Link>
            ))}
          </div>

          <div className="mk-footer__col">
            <span className="mk-label">Get in</span>
            <Link href="/request-access" className="mk-footer__link">
              Request access
            </Link>
            <Link href="/login" className="mk-footer__link">
              Sign in
            </Link>
          </div>
        </div>

        <div className="mk-footer__fine">
          <span className="mk-label">Invite only · 2026</span>
          <span className="mk-label">
            Every claim on these pages is something the app does today
          </span>
        </div>
      </div>
    </footer>
  )
}
