import Link from 'next/link'

import { MonsteraLeaf, PalmFrond } from '@/components/marketing/botanicals'

// Five auth compositions, all built from the same idea.
//
// The first crit put five unrelated directions up; Rail, Ledger and Field won,
// and they turn out to be one direction seen three ways: the page splits, the
// wordmark takes one side, the form takes the other. So these five are
// variations inside that idea rather than five different ideas — what splits,
// where the split falls, which side carries colour, and whether the card
// respects the seam or crosses it.
//
// Held constant so the crit stays about composition: same chassis, same card,
// same stacked wordmark, same type. What moves is the geometry.
//
// Green is the only core hue the bible allows to run full-bleed as a surface,
// so the variants that flood use green and the rest use tints, which are always
// allowed as fields.
//
// The winner is promoted by changing one line in `(auth)/layout.tsx`, and
// `/design/auth` gets deleted.

export type AuthVariant = 'garden' | 'split' | 'mirror' | 'seam' | 'flood' | 'column'

export const AUTH_VARIANTS: ReadonlyArray<{
  id: AuthVariant
  name: string
  note: string
}> = [
  {
    id: 'garden',
    name: 'Garden',
    note: 'Mirror flipped so the form is on the right, ice carrying the name on the left, and the sand from Column taken up as a second field under the lower half of the white — so the card straddles that seam instead of the page seam. Green monstera and frond crop out of the white side’s corners. Three of the five ideas at once, and the only one where the planting appears on an app screen rather than only on a customer’s.',
  },
  {
    id: 'split',
    name: 'Split',
    note: 'Green takes the left, the name sits on it, the form gets the white. The plainest reading of the idea and the easiest to live with every morning.',
  },
  {
    id: 'mirror',
    name: 'Mirror',
    note: 'Flipped, and cooled to a tint. The form is on the left so it is read first and the name becomes the backdrop rather than the announcement.',
  },
  {
    id: 'seam',
    name: 'Seam',
    note: 'A true half-and-half, with the card straddling the join so it sits on both grounds at once. The split is the composition and the card is what proves it has depth.',
  },
  {
    id: 'flood',
    name: 'Flood',
    note: 'No split at all: the whole page is the field and the card floats on it as the only white. The boldest, and the one that will feel loudest on the fiftieth sign-in.',
  },
  {
    id: 'column',
    name: 'Column',
    note: 'A narrow sand column with the name set up it vertically, the card overlapping its edge. The most editorial, and the only one where the name is not read first.',
  },
]

const WORD = ['POOL', 'FORGE'] as const

function Stacked({ className = '' }: { className?: string }) {
  return (
    <Link href="/" aria-label="Pool Forge, home" className="block">
      <span className={`block font-medium leading-[0.78] tracking-[-0.05em] ${className}`}>
        {WORD.map((w) => (
          <span key={w} className="block">
            {w}
          </span>
        ))}
      </span>
    </Link>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`w-full max-w-sm ${className}`}>{children}</div>
}

export function AuthStage({
  variant,
  children,
}: {
  variant: AuthVariant
  children: React.ReactNode
}) {
  // ── 00 Garden ────────────────────────────────────────────────────────────
  if (variant === 'garden') {
    return (
      <div className="flex min-h-screen flex-col bg-theme-bg text-theme-fg lg:flex-row">
        {/* Left: the name on ice. Cool, flat, and the quietest of the tints, so
            it can hold type at this size without competing with the form. */}
        <div
          className="flex items-center px-8 py-14 lg:w-[46%] lg:px-14 lg:py-0"
          style={{ background: 'var(--tint-ice)' }}
        >
          <Stacked className="text-[clamp(3.5rem,9vw,8rem)] text-ink-black" />
        </div>

        {/* Right: white above, sand below, card across the join. A second seam
            inside the panel rather than another split of the page — the card
            lands on it, so the depth cue is in the same place the eye already
            is rather than off at the page's centre line. */}
        <div className="relative isolate flex flex-1 items-center justify-center overflow-hidden px-8 py-16">
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 -z-10 h-1/2"
            style={{ background: 'var(--tint-sand)' }}
          />

          {/* Planting out of the corners. The botanicals were written for the
              surfaces about the finished yard rather than about the tool; this
              is the one app screen where that is still true, because it is the
              door rather than the workshop. */}
          <MonsteraLeaf
            id="auth-garden-leaf"
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 -z-10 h-72 w-64 lg:-right-24 lg:h-[26rem] lg:w-[22rem]"
            style={{ color: 'var(--brand-green)', transform: 'rotate(22deg)' }}
          />
          <PalmFrond
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-72 w-72 lg:h-[26rem] lg:w-[26rem]"
            style={{ color: 'var(--brand-green)', transform: 'rotate(-28deg)' }}
          />

          <Card className="relative z-10 rounded-brand24 bg-theme-bg shadow-elevation2">
            {children}
          </Card>
        </div>
      </div>
    )
  }

  // ── 01 Split ─────────────────────────────────────────────────────────────
  if (variant === 'split') {
    return (
      <div className="flex min-h-screen flex-col bg-theme-bg text-theme-fg lg:flex-row">
        <div
          className="flex items-center px-8 py-14 lg:w-[46%] lg:px-14 lg:py-0"
          style={{ background: 'var(--brand-green)' }}
        >
          <Stacked className="text-[clamp(3.5rem,9vw,8rem)] text-ink-black" />
        </div>
        <div className="flex flex-1 items-center justify-center px-8 py-16">
          <Card>{children}</Card>
        </div>
      </div>
    )
  }

  // ── 02 Mirror ────────────────────────────────────────────────────────────
  if (variant === 'mirror') {
    return (
      <div className="flex min-h-screen flex-col-reverse bg-theme-bg text-theme-fg lg:flex-row">
        <div className="flex flex-1 items-center justify-center px-8 py-16">
          <Card>{children}</Card>
        </div>
        <div
          className="flex items-center justify-end px-8 py-14 lg:w-[46%] lg:px-14 lg:py-0"
          style={{ background: 'var(--tint-ice)' }}
        >
          <Stacked className="text-right text-[clamp(3.5rem,9vw,8rem)] text-ink-black" />
        </div>
      </div>
    )
  }

  // ── 03 Seam ──────────────────────────────────────────────────────────────
  if (variant === 'seam') {
    return (
      <div className="relative isolate min-h-screen bg-theme-bg text-theme-fg">
        {/* The two grounds, meeting exactly in the middle. */}
        <div aria-hidden className="absolute inset-0 flex">
          <div className="hidden w-1/2 lg:block" style={{ background: 'var(--brand-green)' }} />
          <div className="w-full bg-theme-bg lg:w-1/2" />
        </div>
        <div className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-8 py-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-0">
          <div className="w-full lg:pl-14">
            <Stacked className="text-[clamp(3.5rem,8vw,7rem)] text-ink-black" />
          </div>
          {/* Pulled back across the join so it genuinely sits on both grounds.
              The card is 24rem, so a 10rem pull leaves roughly a third of it on
              the green — enough to read as crossing rather than as nudged. */}
          <div className="flex w-full justify-center lg:justify-start lg:-ml-40">
            <Card className="shadow-elevation2">{children}</Card>
          </div>
        </div>
      </div>
    )
  }

  // ── 04 Flood ─────────────────────────────────────────────────────────────
  if (variant === 'flood') {
    return (
      <div
        className="flex min-h-screen flex-col justify-center px-8 py-16 text-theme-fg lg:px-16"
        style={{ background: 'var(--brand-green)' }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
          <Stacked className="text-[clamp(3.5rem,10vw,9rem)] text-ink-black" />
          <Card className="rounded-brand24 bg-theme-bg shadow-elevation2">{children}</Card>
        </div>
      </div>
    )
  }

  // ── 05 Column ────────────────────────────────────────────────────────────
  return (
    <div className="relative isolate flex min-h-screen items-center bg-theme-bg text-theme-fg">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 hidden w-[28%] lg:block"
        style={{ background: 'var(--tint-sand)' }}
      />
      <div className="relative flex w-full items-center gap-10 px-8 py-16 lg:px-14">
        <div className="hidden lg:block">
          <Link href="/" aria-label="Pool Forge, home">
            <span className="block whitespace-nowrap text-[clamp(2.5rem,6vw,4.5rem)] font-medium tracking-[-0.05em] text-ink-black [writing-mode:vertical-rl] [transform:rotate(180deg)]">
              POOL FORGE
            </span>
          </Link>
        </div>
        {/* Overlapping the column's edge rather than clearing it. */}
        <div className="flex w-full justify-center lg:justify-start lg:pl-8">
          <Card className="lg:shadow-elevation2">
            <div className="lg:hidden">
              <Stacked className="mb-8 text-[clamp(3rem,13vw,5rem)]" />
            </div>
            {children}
          </Card>
        </div>
      </div>
    </div>
  )
}
