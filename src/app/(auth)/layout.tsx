import { Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import Link from 'next/link'

// The front door of the app, and the one place the chassis is allowed to be
// loud.
//
// Everywhere else the brand bible is emphatic that colour is a guest: black
// type, white ground, hairlines, and the core spectrum kept to illustration.
// This surface suspends that on purpose. It is the first thing a builder sees
// every morning and the last thing they see before the product turns quiet and
// monochrome for the rest of the day, so it gets the whole spectrum at once and
// the wordmark at a size it never reaches again.
//
// It stays inside the system rather than escaping it. The shapes are the
// bible's own abstract accents — hard-edged, flat, full saturation, no
// gradients, no outlines, no shadows — overlapping each other and cropping off
// every edge, which is exactly what that pattern asks for. The type is the top
// of the named scale pushed further, with the tracking tightened the way the
// scale tightens. And the card itself does not join in: it stays white, quiet
// and disciplined, because the thing you came here to do is type a password.
//
// Documented exception, not a drift. If a second surface wants this treatment,
// that is a conversation about the bible rather than a copy-paste from here.

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

/**
 * One flat shape.
 *
 * Kept as data rather than markup so the composition can be read at a glance
 * and rebalanced without hunting through JSX. Every colour is a brand token.
 */
const SHAPES = [
  // Top left: a square with a quarter circle bitten out, cropping two edges.
  // In FRONT of the type, so it eats the corner of the P.
  {
    key: 'bite-orange',
    layer: 'front',
    className:
      'absolute -left-16 -top-16 h-52 w-52 lg:-left-24 lg:-top-24 lg:h-[26rem] lg:w-[26rem]',
    style: {
      background: 'var(--brand-orange)',
      WebkitMaskImage: 'radial-gradient(circle at 100% 100%, transparent 0 52%, #000 52%)',
      maskImage: 'radial-gradient(circle at 100% 100%, transparent 0 52%, #000 52%)',
    },
  },
  // Bottom left: opposing petals, behind.
  {
    key: 'petal-purple',
    layer: 'back',
    className:
      'absolute -bottom-20 -left-14 h-52 w-52 rounded-[100%_0_100%_0] lg:-bottom-28 lg:-left-16 lg:h-[22rem] lg:w-[22rem]',
    style: { background: 'var(--brand-purple)' },
  },
  // The bar runs straight across the letters in FRONT of them. This is the one
  // that sells the sandwich: a hard edge crossing a glyph and cutting it in two
  // is the strongest depth cue available without perspective.
  {
    key: 'bar-blue',
    layer: 'front',
    className:
      'absolute -right-24 top-[9%] h-9 w-72 rounded-full lg:-right-32 lg:top-[18%] lg:h-16 lg:w-[34rem]',
    style: { background: 'var(--brand-blue)' },
  },
  // Bottom right: the twelve-spoke fan, cropped, in FRONT of the E.
  {
    key: 'fan-green',
    layer: 'front',
    className:
      'absolute -bottom-24 -right-20 h-72 w-72 rounded-full lg:-bottom-40 lg:-right-32 lg:h-[30rem] lg:w-[30rem]',
    style: {
      background:
        'repeating-conic-gradient(var(--brand-green) 0deg, var(--brand-green) 18deg, transparent 18deg, transparent 30deg)',
    },
  },
  // Top right: a checkerboard, the quietest of the five, behind. It is the one
  // that crowds a narrow screen, so it only appears once there is room for it.
  {
    key: 'check-red',
    layer: 'back',
    className: 'absolute -top-10 right-[12%] hidden h-40 w-[18rem] lg:block',
    style: {
      backgroundImage:
        'conic-gradient(var(--brand-red) 0 25%, transparent 0 50%, var(--brand-red) 0 75%, transparent 0)',
      backgroundSize: '2rem 2rem',
    },
  },
] as const

/**
 * The wordmark as a stacked lockup: two words, one block.
 *
 * Each line is justified to the same width, so POOL and FORGE end flush on both
 * edges and the pair reads as a single rectangular mass rather than as two
 * centred lines that happen to sit near each other. That is what makes it a
 * logotype instead of a heading.
 *
 * All ink, no colour. Filling individual letters was tried and read as
 * childish — the spectrum belongs in the shapes behind, where the bible puts
 * it, and the type stays black.
 */
const WORDMARK = ['POOL', 'FORGE'] as const

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-accent="signal"
      className={`${displaySans.variable} ${displayMono.variable} relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden bg-theme-bg px-6 py-16 font-display text-theme-fg`}
      style={
        {
          // `--font-sans` / `--font-mono` live on `:root` and substitute
          // `var(--font-display-*)` at the element that DECLARES them, not the
          // one that uses them. Setting the two next/font variables here does
          // nothing unless the tokens are redeclared at this same element.
          // Same fix `marketing.css` applies to `.mk`; getting it wrong is what
          // silently rendered every marketing page in SF Pro for a day.
          '--font-sans': `${displaySans.style.fontFamily}, system-ui, helvetica, sans-serif`,
          '--font-mono': `${displayMono.style.fontFamily}, menlo, monospace`,
        } as React.CSSProperties
      }
    >
      {/* ── Layer 1: shapes behind the type ───────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {SHAPES.filter((s) => s.layer === 'back').map((shape) => (
          <span key={shape.key} className={shape.className} style={shape.style} />
        ))}
      </div>

      {/* ── Layer 2: the wordmark ─────────────────────────────────────── */}
      {/* Sized off the viewport rather than off the card, so it runs wider than
          the card can cover and the word continues out either side.
       *
          Set solid and centred rather than justified across the full width.
          Justifying was tried and it spread POOL and FORGE into loose columns
          of letters: with the card then covering the middle, nothing was left
          to read. Occlusion only works if the eye can complete the word, so the
          letters stay tight and the card takes a bite out of the middle.
       *
          Leading under 1 closes the two lines into one mass. All ink: the
          spectrum lives in the shapes, not in the letters. */}
      <div className="relative flex w-full flex-col items-center">
        <Link
          href="/"
          aria-label="Pool Forge, home"
          className="relative z-10 block text-center font-medium leading-[0.78] tracking-[-0.045em] text-theme-fg"
        >
          {WORDMARK.map((word) => (
            {/* The lower bound is set off the viewport, not off taste: on a
                phone the card is nearly full width, so if the wordmark is
                narrower than the card the bottom line vanishes entirely and
                there is no occlusion left, just a hidden word. It has to stay
                wider than the card at every size. */}
            <span key={word} aria-hidden className="block text-[clamp(5.5rem,32vw,12rem)]">
              {word}
            </span>
          ))}
        </Link>

      {/* ── Layer 3: shapes in FRONT of the type ──────────────────────── */}
      {/* This is the layer that does the work. Occlusion is the strongest depth
          cue there is short of real perspective, and a hard-edged shape cutting
          straight across a letterform reads as depth instantly — the same trick
          as a subject cut out over a headline, without needing a photograph
          this product does not have. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
        {SHAPES.filter((s) => s.layer === 'front').map((shape) => (
          <span key={shape.key} className={shape.className} style={shape.style} />
        ))}
      </div>

        {/* ── Layer 4: the card, in front of everything ───────────────── */}
        {/* The card is the front plane, pulled up so it takes a bite out of the
            bottom word rather than sitting under the block. A negative margin
            rather than absolute placement, so the overlap stays the same
            fraction of the wordmark at every size instead of drifting as the
            viewport changes.
         *
            POOL stays clear above it and FORGE runs behind it and out both
            sides, which is the read: one line whole, one line occluded. Cover
            both and there is nothing left to complete. */}
        <div className="relative z-30 -mt-10 w-full max-w-sm sm:-mt-14 lg:-mt-20">
          {children}
        </div>
      </div>
    </main>
  )
}
