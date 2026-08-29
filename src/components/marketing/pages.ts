// The three marketing pages, in one place.
//
// The nav, the footer and the "read next" cards at the foot of every page are
// all built from this list, so adding a fourth page is one entry rather than
// four edits that drift.

export interface MarketingPage {
  href: string
  /** Nav label. One word where one word will do. */
  nav: string
  /** Card title at the foot of the other two pages. */
  title: string
  /** One line, written for a builder rather than for us. */
  blurb: string
  /** Accent family from the brand bible. Nothing else changes per page. */
  accent: 'azure' | 'sandbar' | 'dusk'
}

export const MARKETING_PAGES: readonly MarketingPage[] = [
  {
    href: '/product/editor',
    nav: 'Editor',
    title: 'The editor',
    blurb:
      'Draw the pool in a browser, stand it up in 3D, and read the measurements off the drawing instead of a tape.',
    accent: 'azure',
  },
  {
    href: '/product/quoting',
    nav: 'Quoting',
    title: 'Quoting and paperwork',
    blurb:
      'Your price book against the shape you drew, then the proposal, the construction set and the permit-ready site plan.',
    accent: 'sandbar',
  },
  {
    href: '/product/business',
    nav: 'Jobs',
    title: 'Jobs and the record',
    blurb:
      'Customers, jobs, the photos they send you before you drive out, and a written record of everything anybody changed.',
    accent: 'dusk',
  },
]

export function otherPages(currentHref: string): readonly MarketingPage[] {
  return MARKETING_PAGES.filter((p) => p.href !== currentHref)
}
