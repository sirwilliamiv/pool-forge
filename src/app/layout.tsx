import type { Metadata } from 'next'
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { WordmarkFavicon } from '@/components/dashboard/WordmarkFavicon'
import { Providers } from '@/lib/providers'
import './globals.css'

// The brand faces, loaded once for the whole product.
//
// They were being loaded per route group — marketing, then auth — which meant
// every screen in `(app)` rendered in the system stack instead: the nav, the
// dashboard, the price book, all of it in SF Pro on a brand whose foundation is
// a two-typeface system. Nothing errored, because an unset `--font-display-*`
// falls through to the fallback rather than failing.
//
// The subtlety that made it easy to get wrong three times in a row: a custom
// property substitutes its `var()`s at the element that DECLARES it, not the
// element that uses it. `--font-sans` is declared on `:root` in
// `src/styles/brand.css`, where `--font-display-sans` does not exist, so `:root`
// baked in the fallback and inherited that everywhere. Setting the next/font
// variables somewhere below `:root` does nothing on its own — the tokens have
// to be redeclared at the same element, which is what the `style` block below
// is for.
//
// Loading them here means every route group gets the real faces without having
// to remember. The marketing and auth layouts still declare their own copies;
// harmless, identical values, and worth leaving until those branches settle.

const displaySans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display-sans',
})

const displayMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display-mono',
})

export const metadata: Metadata = {
  title: 'Pool Forge',
  description: 'Pool design, estimating, and proposal platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displaySans.variable} ${displayMono.variable}`}>
      <body
        className="min-h-screen bg-background font-sans antialiased"
        style={
          {
            '--font-sans': `${displaySans.style.fontFamily}, system-ui, helvetica, sans-serif`,
            '--font-mono': `${displayMono.style.fontFamily}, menlo, monospace`,
          } as React.CSSProperties
        }
      >
        <WordmarkFavicon />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
