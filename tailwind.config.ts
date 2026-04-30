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
      },
      boxShadow: {
        // Pool Forge spec shadow ladder (§3).
        pfXs: 'var(--pf-shadow-xs)',
        pfSm: 'var(--pf-shadow-sm)',
        pfMd: 'var(--pf-shadow-md)',
        pfLg: 'var(--pf-shadow-lg)',
      },
    },
  },
  plugins: [],
}

export default config
