import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/modules/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Pool Forge spec tokens (§3) — distinct from shadcn `accent` to avoid collision.
        canvas: 'var(--pf-canvas-bg)',
        pfAccent: 'var(--pf-accent)',
        pfAccentStrong: 'var(--pf-accent-strong)',
        pfAccentSoft: 'var(--pf-accent-soft)',
        textMuted: 'var(--pf-text-muted)',
        textFaint: 'var(--pf-text-faint)',
        pfWarn: 'var(--pf-warn)',
        warnSoft: 'var(--pf-warn-soft)',
        pfError: 'var(--pf-error)',
        errorSoft: 'var(--pf-error-soft)',
        borderLight: 'var(--pf-border-light)',
        rowHover: 'var(--pf-row-hover)',
        rowActive: 'var(--pf-row-active)',

        // ── Brand bible (docs/brand-bible.md) ────────────────────────────
        //
        // Defined in `src/styles/brand.css` and pointed at here rather than
        // repeated, so there is one place a hex can be wrong. Namespaced under
        // brand / ink / tint / theme because the four groups above are the old
        // vocabulary and both have to coexist while screens are converted one
        // at a time.
        brand: {
          orange: 'var(--brand-orange)',
          red: 'var(--brand-red)',
          purple: 'var(--brand-purple)',
          blue: 'var(--brand-blue)',
          green: 'var(--brand-green)',
          uiBlue: 'var(--brand-ui-blue)',
        },
        ink: {
          black: 'var(--ink-black)',
          warm: 'var(--ink-warm)',
          slate: 'var(--ink-slate)',
          mist: 'var(--ink-mist)',
          paper: 'var(--ink-paper)',
          white: 'var(--ink-white)',
        },
        tint: {
          ice: 'var(--tint-ice)',
          paleBlue: 'var(--tint-pale-blue)',
          mint: 'var(--tint-mint)',
          honeydew: 'var(--tint-honeydew)',
          sage: 'var(--tint-sage)',
          sand: 'var(--tint-sand)',
          blush: 'var(--tint-blush)',
          lilac: 'var(--tint-lilac)',
          periwinkle: 'var(--tint-periwinkle)',
          orchid: 'var(--tint-orchid)',
          aqua: 'var(--tint-aqua)',
          slateMist: 'var(--tint-slate-mist)',
        },
        // The themeable set. These follow `--theme-fg` / `--theme-bg`, so a
        // component built from them inverts for free and a component built
        // from a literal grey does not.
        theme: {
          bg: 'var(--theme-bg)',
          fg: 'var(--theme-fg)',
          muted: 'var(--theme-fg-muted)',
          faint: 'var(--theme-fg-faint)',
          line: 'var(--theme-border)',
          lineSoft: 'var(--theme-border-soft)',
          card: 'var(--theme-card-bg)',
          field: 'var(--theme-input-bg)',
        },
        // Whatever family the nearest `data-accent` wrapper set. Not named
        // `--accent`: that one is shadcn's, and Tailwind flattens `@layer base`
        // so globals.css wins it at `:root`.
        family: {
          accent: 'var(--family-accent)',
          tint: 'var(--family-tint)',
          tint2: 'var(--family-tint-2)',
        },
      },
      fontFamily: {
        // New keys, not overrides. Tailwind's own `font-sans` and `font-mono`
        // are load-bearing on every authenticated screen, and repointing them
        // at a variable that only the marketing layout sets would change the
        // type on all of them at once.
        display: 'var(--font-sans)',
        brandMono: 'var(--font-mono)',
      },
      fontSize: {
        // The named scale, each step carrying its own leading and tracking:
        // the bigger the type, the tighter the tracking. Using `text-title1`
        // gets all three, which is the point of naming them.
        display1: ['var(--size-display1)', { lineHeight: '1', letterSpacing: '-1.25px' }],
        display2: ['var(--size-display2)', { lineHeight: '1.1', letterSpacing: '-0.66px' }],
        title1: ['var(--size-title1)', { lineHeight: '1.2', letterSpacing: '-0.66px' }],
        title2: ['var(--size-title2)', { lineHeight: '1.2', letterSpacing: '-0.66px' }],
        title3: ['var(--size-title3)', { lineHeight: '1.2', letterSpacing: '-0.66px' }],
        title4: ['var(--size-title4)', { lineHeight: '1.2', letterSpacing: '-0.66px' }],
        bodyXL: ['var(--size-bodyxl)', { lineHeight: '1.4', letterSpacing: '-0.12px' }],
        bodyL: ['var(--size-bodyl)', { lineHeight: '1.4', letterSpacing: '-0.12px' }],
        bodyS: ['var(--size-body)', { lineHeight: '1.4', letterSpacing: '0' }],
        // Mono always takes positive tracking.
        badge: ['var(--size-badge)', { lineHeight: '1', letterSpacing: '0.6px' }],
        formLabel: ['var(--size-formlabel)', { lineHeight: '1.2', letterSpacing: '0.5px' }],
      },
      spacing: {
        // The ramp is 4 6 8 12 16 24 32 40 56 64 80 120, which is Tailwind's
        // default scale plus one step. 80 is the default section block padding
        // and 120 is a major section break.
        30: '7.5rem',
      },
      maxWidth: {
        content: 'var(--max-content-width)',
        grid: 'var(--grid-max-width)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Pool Forge spec radius ladder (§3).
        pfXs: '4px',
        pfSm: '6px',
        pfMd: '10px',
        pfLg: '14px',
        // Brand bible ladder. In practice four get used: `brand` (8px) for
        // every button, brand2/brand4 for chrome details, brand16/brand24 for
        // media cards, and `full` for avatars and icon buttons.
        brand2: 'var(--radius-2)',
        brand4: 'var(--radius-4)',
        brand: 'var(--radius-8)',
        brand12: 'var(--radius-12)',
        brand16: 'var(--radius-16)',
        brand24: 'var(--radius-24)',
        brand28: 'var(--radius-28)',
      },
      boxShadow: {
        // Pool Forge spec shadow ladder (§3).
        pfXs: 'var(--pf-shadow-xs)',
        pfSm: 'var(--pf-shadow-sm)',
        pfMd: 'var(--pf-shadow-md)',
        pfLg: 'var(--pf-shadow-lg)',
        // Brand bible: both of them. There is no mid step on purpose, and
        // elevation2 belongs to the one overlapping element in a composition.
        elevation1: 'var(--elevation-1)',
        elevation2: 'var(--elevation-2)',
      },
      backgroundImage: {
        // The twelve-spoke starburst, in whatever the nearest family's accent
        // is. `bg-rayFan` on a rounded-full box is the whole effect.
        rayFan: 'var(--ray-fan)',
      },
      transitionTimingFunction: {
        brand: 'ease-out',
      },
      transitionDuration: {
        // The only motion below the fold: 0.18s background fades on buttons.
        brand: '180ms',
      },
    },
  },
  plugins: [],
}

export default config
