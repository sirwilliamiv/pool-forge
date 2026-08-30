import Link from 'next/link'

// Five compositions for the auth surface, so there is something to argue about
// rather than one option to approve.
//
// They are deliberately different directions rather than five settings of the
// same one: where the wordmark sits, whether it is horizontal or vertical,
// whether colour is a set of cropped shapes or one full-bleed field, and
// whether the card floats or is anchored. Everything else is held constant —
// same chassis, same card, same type — so a crit is about composition and not
// about which one happens to have nicer buttons.
//
// The winner gets promoted by changing one line in `(auth)/layout.tsx`. Until
// then `/design/auth` renders all five side by side.

export type AuthVariant = 'rail' | 'ledger' | 'spine' | 'field' | 'tile'

export const AUTH_VARIANTS: ReadonlyArray<{
  id: AuthVariant
  name: string
  note: string
}> = [
  {
    id: 'rail',
    name: 'Rail',
    note: 'Wordmark stacked flush left and running off the bottom, card held to the right. Reads like a masthead: the name is the page and the form is a panel on it.',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    note: 'Mirrored. Wordmark flush right, card left, one enormous shape behind the card rather than five small ones. Quieter, and the eye lands on the form first.',
  },
  {
    id: 'spine',
    name: 'Spine',
    note: 'Wordmark rotated and set up the left edge like a book spine, card centred. The most editorial of the five, and the only one where the name is not the first thing read.',
  },
  {
    id: 'field',
    name: 'Field',
    note: 'Half the page is a full-bleed green field with the name knocked out of it, the card sits on the white half. Green is the one hue the bible lets run full-bleed, so this is the boldest option that is still in the system.',
  },
  {
    id: 'tile',
    name: 'Tile',
    note: 'No large shapes at all. The ground becomes a tint tile field, the wordmark drops to a small mono lockup, and the card floats on elevation-2. The calmest, and the one that scales to a phone without changing.',
  },
]

const WORD = ['POOL', 'FORGE'] as const

function Stacked({ className = '' }: { className?: string }) {
  return (
    <span className={`block font-medium leading-[0.78] tracking-[-0.045em] ${className}`}>
      {WORD.map((w) => (
        <span key={w} className="block">
          {w}
        </span>
      ))}
    </span>
  )
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/" aria-label="Pool Forge, home" className="relative z-10 block">
      {children}
    </Link>
  )
}

/** Flat, hard-edged, full saturation, cropped by the page. */
function Shape({ className, style }: { className: string; style: React.CSSProperties }) {
  return <span aria-hidden className={`absolute ${className}`} style={style} />
}

const BITE = {
  WebkitMaskImage: 'radial-gradient(circle at 100% 100%, transparent 0 52%, #000 52%)',
  maskImage: 'radial-gradient(circle at 100% 100%, transparent 0 52%, #000 52%)',
}

const FAN = (hue: string) => ({
  background: `repeating-conic-gradient(${hue} 0deg, ${hue} 18deg, transparent 18deg, transparent 30deg)`,
})

const CHECK = (hue: string) => ({
  backgroundImage: `conic-gradient(${hue} 0 25%, transparent 0 50%, ${hue} 0 75%, transparent 0)`,
  backgroundSize: '2rem 2rem',
})

export function AuthStage({
  variant,
  children,
}: {
  variant: AuthVariant
  children: React.ReactNode
}) {
  const card = <div className="w-full max-w-sm">{children}</div>

  if (variant === 'rail') {
    return (
      <div className="relative isolate flex min-h-full items-center overflow-hidden bg-theme-bg px-8 py-16 text-theme-fg">
        <Shape
          className="-left-24 -top-24 h-[26rem] w-[26rem]"
          style={{ background: 'var(--brand-orange)', ...BITE }}
        />
        <Shape
          className="-bottom-28 left-[18%] h-[20rem] w-[20rem] rounded-[100%_0_100%_0]"
          style={{ background: 'var(--brand-purple)' }}
        />
        <Shape className="-right-28 top-[16%] h-14 w-[30rem] rounded-full" style={{ background: 'var(--brand-blue)' }} />
        <div className="relative z-10 flex w-full items-center justify-between gap-12">
          <Mark>
            <Stacked className="text-[clamp(3rem,11vw,9rem)]" />
          </Mark>
          {card}
        </div>
      </div>
    )
  }

  if (variant === 'ledger') {
    return (
      <div className="relative isolate flex min-h-full items-center overflow-hidden bg-theme-bg px-8 py-16 text-theme-fg">
        <Shape
          className="-bottom-40 -left-40 h-[42rem] w-[42rem] rounded-full"
          style={{ background: 'var(--tint-mint)' }}
        />
        <div className="relative z-10 flex w-full items-center justify-between gap-12">
          {card}
          <Mark>
            <Stacked className="text-right text-[clamp(3rem,11vw,9rem)]" />
          </Mark>
        </div>
      </div>
    )
  }

  if (variant === 'spine') {
    return (
      <div className="relative isolate flex min-h-full items-center justify-center overflow-hidden bg-theme-bg px-8 py-16 text-theme-fg">
        <Shape className="-right-24 -top-24 h-[24rem] w-[24rem] rounded-full" style={FAN('var(--brand-green)')} />
        <div className="absolute left-8 top-1/2 z-10 -translate-y-1/2">
          <Mark>
            <span className="block whitespace-nowrap text-[clamp(2.5rem,7vw,5rem)] font-medium tracking-[-0.045em] [writing-mode:vertical-rl] [transform:rotate(180deg)]">
              POOL FORGE
            </span>
          </Mark>
        </div>
        <div className="relative z-10">{card}</div>
      </div>
    )
  }

  if (variant === 'field') {
    return (
      <div className="relative isolate flex min-h-full overflow-hidden bg-theme-bg text-theme-fg">
        <div
          className="relative hidden w-[46%] items-center justify-center px-10 lg:flex"
          style={{ background: 'var(--brand-green)' }}
        >
          <Mark>
            <Stacked className="text-[clamp(3rem,7vw,7rem)] text-ink-black" />
          </Mark>
        </div>
        <div className="flex flex-1 items-center justify-center px-8 py-16">
          <div className="w-full max-w-sm">
            <Mark>
              <Stacked className="mb-10 text-[clamp(3rem,14vw,5rem)] lg:hidden" />
            </Mark>
            {children}
          </div>
        </div>
      </div>
    )
  }

  // tile
  return (
    <div
      className="relative isolate flex min-h-full items-center justify-center overflow-hidden px-8 py-16 text-theme-fg"
      style={CHECK('var(--tint-ice)')}
    >
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <Mark>
          <span className="mb-8 block font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-fg">
            Pool Forge
          </span>
        </Mark>
        <div className="w-full rounded-brand24 bg-theme-bg shadow-elevation2">{children}</div>
      </div>
    </div>
  )
}
