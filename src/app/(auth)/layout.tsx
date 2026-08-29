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
  {
    key: 'bite-orange',
    className:
      'absolute -left-16 -top-16 h-52 w-52 lg:-left-24 lg:-top-24 lg:h-[26rem] lg:w-[26rem]',
    style: {
      background: 'var(--brand-orange)',
      WebkitMaskImage: 'radial-gradient(circle at 100% 100%, transparent 0 52%, #000 52%)',
      maskImage: 'radial-gradient(circle at 100% 100%, transparent 0 52%, #000 52%)',
    },
  },
  // Bottom left: opposing petals.
  {
    key: 'petal-purple',
    className:
      'absolute -bottom-20 -left-14 h-52 w-52 rounded-[100%_0_100%_0] lg:-bottom-28 lg:-left-16 lg:h-[22rem] lg:w-[22rem]',
    style: { background: 'var(--brand-purple)' },
  },
  // Right: a bar running off the edge.
  {
    key: 'bar-blue',
    className:
      'absolute -right-24 top-[9%] h-9 w-72 rounded-full lg:-right-32 lg:top-[18%] lg:h-16 lg:w-[34rem]',
    style: { background: 'var(--brand-blue)' },
  },
  // Bottom right: the twelve-spoke fan, cropped.
  {
    key: 'fan-green',
    className:
      'absolute -bottom-24 -right-20 h-72 w-72 rounded-full lg:-bottom-40 lg:-right-32 lg:h-[30rem] lg:w-[30rem]',
    style: {
      background:
        'repeating-conic-gradient(var(--brand-green) 0deg, var(--brand-green) 18deg, transparent 18deg, transparent 30deg)',
    },
  },
  // Top right: a checkerboard, the quietest of the five. It is the one that
  // crowds a narrow screen, so it only appears once there is room for it.
  {
    key: 'check-red',
    className: 'absolute -top-10 right-[12%] hidden h-40 w-[18rem] lg:block',
    style: {
      backgroundImage:
        'conic-gradient(var(--brand-red) 0 25%, transparent 0 50%, var(--brand-red) 0 75%, transparent 0)',
      backgroundSize: '2rem 2rem',
    },
  },
] as const

/**
 * The wordmark, letter by letter, so the round ones can carry colour.
 *
 * Only the `o`s are filled, and they take three of the five core hues in the
 * order the spectrum runs. Colouring more than the round letters turns a
 * logotype into a ransom note; colouring fewer loses the point.
 */
const WORDMARK: ReadonlyArray<ReadonlyArray<{ c: string; color?: string }>> = [
  [{ c: 'P' }, { c: 'o', color: 'var(--brand-orange)' }, { c: 'o', color: 'var(--brand-blue)' }, { c: 'l' }],
  [{ c: 'F' }, { c: 'o', color: 'var(--brand-green)' }, { c: 'r' }, { c: 'g' }, { c: 'e' }],
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-accent="signal"
      className={`${displaySans.variable} ${displayMono.variable} relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-theme-bg px-6 py-16 font-display text-theme-fg`}
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
      {/* The festival. Behind everything and clipped by the page. It shrinks on
          a phone rather than disappearing: hiding it there would mean the one
          surface that is meant to be loud is monochrome for anyone signing in
          from a truck, which is most of them. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {SHAPES.map((shape) => (
          <span key={shape.key} className={shape.className} style={shape.style} />
        ))}
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center">
        {/* The wordmark, at a size it reaches nowhere else in the product, and
            the only place the spectrum gets inside the type rather than sitting
            behind it.
         *
            Two words locked into one block: leading under 1 so the lines close
            up into a mass rather than reading as two lines of a sentence, and
            the tracking pulled in hard the way the scale tightens as it grows.
         *
            The colour lands on the round letters, which is the one substitution
            that survives being read: an `o` in a geometric grotesque is already
            a disc, so filling it reads as a deliberate pop rather than as a
            typo. Everything else stays ink. */}
        <Link
          href="/"
          aria-label="Pool Forge, home"
          className="mb-10 block text-center font-medium leading-[0.78] tracking-[-0.06em] text-theme-fg"
        >
          {WORDMARK.map((line, i) => (
            <span key={i} className="block text-[clamp(3.75rem,13vw,9rem)]">
              {line.map((glyph, j) => (
                <span
                  key={j}
                  {...(glyph.color ? { style: { color: glyph.color } } : {})}
                >
                  {glyph.c}
                </span>
              ))}
            </span>
          ))}
        </Link>

        <div className="w-full">{children}</div>
      </div>
    </main>
  )
}
