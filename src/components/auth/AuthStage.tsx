import Link from 'next/link'

import { MonsteraLeaf, PalmFrond } from '@/components/marketing/botanicals'

// The auth composition. One, now: Garden won the crit and the other five are
// deleted rather than kept as options nobody will choose.
//
// Three vertical bands across the page — ice for half, white for a quarter,
// sand for the last quarter. The card centres on the right half, which lands it
// across the white-to-sand join, so it straddles a seam and reads as sitting in
// front of the page rather than on it. Occlusion is the strongest depth cue
// there is short of real perspective, and this gets it from the card that had
// to be somewhere anyway.
//
// The monstera and the frond crop out of the white band's own corners and clip
// at the ice, so the green appears to grow from behind the middle band rather
// than being laid over the whole page. This is the only app screen the
// botanicals appear on: `docs/brand-bible.md` scopes them to surfaces about the
// finished yard rather than about the tool, and login holds that line because
// it is the door rather than the workshop.
//
// On a phone the bands stack — ice with the name, white with the planting, sand
// as a base — and the card keeps straddling the join, so the composition
// survives the layout change instead of being replaced by a different one.

const WORD = ['POOL', 'FORGE'] as const

export function AuthStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-theme-bg text-theme-fg lg:flex-row">
      {/* Half the page: the name on ice. The quietest tint in the system, so it
          can hold type at this size without competing with the form. */}
      <div
        className="flex items-center px-8 py-14 lg:w-1/2 lg:px-14 lg:py-0"
        style={{ background: 'var(--tint-ice)' }}
      >
        <Link href="/" aria-label="Pool Forge, home" className="block">
          <span className="block font-medium leading-[0.78] tracking-[-0.05em] text-ink-black">
            {WORD.map((w) => (
              <span key={w} className="block text-[clamp(3.5rem,8vw,7.5rem)]">
                {w}
              </span>
            ))}
          </span>
        </Link>
      </div>

      <div className="relative isolate flex flex-1 items-center justify-center overflow-hidden px-8 py-16">
        {/* The far quarter. On a phone the bands stack, so it becomes a base the
            card sits above rather than a column beside it. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 -z-20 h-1/3 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-1/2"
          style={{ background: 'var(--tint-sand)' }}
        />

        <MonsteraLeaf
          id="auth-garden-leaf"
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-20 -z-10 h-64 w-56 lg:-left-20 lg:h-[24rem] lg:w-[20rem]"
          style={{ color: 'var(--brand-green)', transform: 'rotate(24deg)' }}
        />
        <PalmFrond
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-20 -z-10 h-64 w-64 lg:h-[24rem] lg:w-[24rem]"
          style={{ color: 'var(--brand-green)', transform: 'rotate(-30deg)' }}
        />

        <div className="relative z-10 w-full max-w-sm rounded-brand24 bg-theme-bg shadow-elevation2">
          {children}
        </div>
      </div>
    </div>
  )
}
