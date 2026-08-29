import { Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import Link from 'next/link'

// Brand bible (docs/brand-bible.md), Frost family: UI blue against ice and
// slate mist. Auth is one quiet moment, not a product surface, so it gets the
// coolest, least saturated family in the system rather than one already
// claimed by an editor, quoting or business screen.
//
// The route group's own faces, same as the marketing layout: an unset
// `--font-display-*` falls through to the system stack, so loading them here
// is what makes `font-display` / `font-brandMono` render as the real type
// instead of the fallback.
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

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-accent="frost"
      className={`${displaySans.variable} ${displayMono.variable} relative flex min-h-screen items-center justify-center overflow-hidden bg-theme-bg p-6 font-display text-theme-fg`}
      style={
        {
          // `--font-sans` / `--font-mono` on `:root` (src/styles/brand.css)
          // substitute `var(--font-display-*)` at the element that DECLARES
          // them, not the element that uses them, so setting the two
          // next/font variables here does nothing unless the tokens
          // themselves are redeclared at this same element. Same fix
          // marketing.css applies to `.mk`.
          '--font-sans': `${displaySans.style.fontFamily}, system-ui, helvetica, sans-serif`,
          '--font-mono': `${displayMono.style.fontFamily}, menlo, monospace`,
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-rayFan opacity-[0.12]"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <Link
          href="/"
          className="mb-8 font-brandMono text-badge uppercase tracking-wide text-theme-muted transition-colors duration-brand ease-brand hover:text-theme-fg"
        >
          Pool Forge
        </Link>
        <div className="w-full">{children}</div>
      </div>
    </main>
  )
}
