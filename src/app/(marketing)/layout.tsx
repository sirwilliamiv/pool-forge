import { Instrument_Sans, JetBrains_Mono } from 'next/font/google'

import { AnnouncementBar } from '@/components/marketing/AnnouncementBar'
import { Footer } from '@/components/marketing/blocks'
import { Nav } from '@/components/marketing/Nav'
import './marketing.css'

// The unauthenticated marketing surface.
//
// It runs on the brand bible (`docs/brand-bible.md`) rather than on the shadcn
// tokens the app uses, which is why this route group carries its own stylesheet
// and its own fonts. The two systems are deliberately not merged yet: the app
// will be converted page by page, and until then nothing here may leak into
// `globals.css` or the other way round.
//
// Instrument Sans and JetBrains Mono are the bible's named stand-ins for
// Display Sans and Display Mono. When the real faces are licensed, this import
// and the two `--font-display-*` variables are the only things that change.
//
// `.mk` is on the wrapper so the nav, the announcement bar and the footer all
// resolve the tokens. Each page repeats it on its own root to carry the
// `data-accent` family, which is the only thing that differs between pages.

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

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mk ${displaySans.variable} ${displayMono.variable}`}>
      <Nav />
      <main className="mk-main">{children}</main>
      <AnnouncementBar />
      <Footer />
    </div>
  )
}
