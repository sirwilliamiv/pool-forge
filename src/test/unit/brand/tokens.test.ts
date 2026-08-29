import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { ACCENT_FAMILIES, ELEVATION, INK, SPECTRUM, TINTS } from '@/lib/brand'

// The brand tokens exist three times over: as CSS custom properties in
// `src/styles/brand.css`, as Tailwind utilities in `tailwind.config.ts`, and as
// TypeScript values in `src/lib/brand.ts`. Three copies of one value is a thing
// that drifts, and the way it drifts is silent: somebody corrects a hex in one
// place, the other two keep the old one, and the product is two shades of
// orange until a person notices.
//
// There is a reason for each copy — CSS cannot be read by a three.js material,
// TypeScript cannot be read by a stylesheet, and Tailwind needs its own map —
// so this file is the thing that makes three copies safe instead of arguing
// they should be one.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8')

const BRAND_CSS = read('src/styles/brand.css')
const MARKETING_CSS = read('src/app/(marketing)/marketing.css')
const TAILWIND = read('tailwind.config.ts')

/** Every `--name: value;` declaration in a stylesheet, last write winning. */
function customProperties(css: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = match[1]
    const value = match[2]
    if (name === undefined || value === undefined) continue
    out.set(name, value.trim())
  }
  return out
}

const TOKENS = customProperties(BRAND_CSS)

/** `--brand-ui-blue` from `uiBlue`, `--tint-pale-blue` from `paleBlue`. */
function kebab(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

describe('the CSS and the TypeScript agree', () => {
  it.each(Object.entries(SPECTRUM))('core spectrum: %s', (name, hex) => {
    expect(TOKENS.get(`--brand-${kebab(name)}`)?.toUpperCase()).toBe(hex.toUpperCase())
  })

  it.each(Object.entries(INK))('ink and neutrals: %s', (name, hex) => {
    expect(TOKENS.get(`--ink-${kebab(name)}`)?.toUpperCase()).toBe(hex.toUpperCase())
  })

  it.each(Object.entries(TINTS))('accent tints: %s', (name, hex) => {
    expect(TOKENS.get(`--tint-${kebab(name)}`)?.toUpperCase()).toBe(hex.toUpperCase())
  })

  it('has both elevations and no third one', () => {
    // The house rule is that there is no mid step. A `--elevation-3` appearing
    // here is the moment the hierarchy starts to collapse, so it fails loudly.
    const levels = [...TOKENS.keys()].filter((k) => /^--elevation-\d+$/.test(k))
    expect(levels.sort()).toEqual(['--elevation-1', '--elevation-2'])
    expect(ELEVATION.one).toContain('4px 32px')
    expect(ELEVATION.two).toContain('24px 70px')
  })
})

describe('the accent families', () => {
  it.each(Object.keys(ACCENT_FAMILIES))('%s has a data-accent block', (family) => {
    expect(BRAND_CSS).toContain(`[data-accent='${family}']`)
  })

  it('declares no family the TypeScript does not know about', () => {
    const declared = [...BRAND_CSS.matchAll(/\[data-accent='([a-z0-9-]+)'\]/gi)].map((m) => m[1])
    expect(new Set(declared)).toEqual(new Set(Object.keys(ACCENT_FAMILIES)))
  })

  it('leaves Inverse out', () => {
    // It is a sub-brand, not a variant: its own ground, its own accent, its own
    // type rendering. Something you can switch into with one attribute would
    // invite exactly the misuse the bible warns about.
    expect(BRAND_CSS).not.toContain("data-accent='inverse'")
    expect(Object.keys(ACCENT_FAMILIES)).not.toContain('inverse')
  })

  it('sets all three of accent, tint and tint-2 in every family', () => {
    for (const [family, values] of Object.entries(ACCENT_FAMILIES)) {
      const block = BRAND_CSS.split(`[data-accent='${family}']`)[1]?.split('}')[0] ?? ''
      expect(block, family).toContain('--family-accent:')
      expect(block, family).toContain('--family-tint:')
      expect(block, family).toContain('--family-tint-2:')
      expect(Object.keys(values).sort()).toEqual(['accent', 'tint', 'tint2'])
    }
  })
})

describe('tokens that reference a token set further down the tree', () => {
  // The trap that has now bitten twice, in the same shape both times.
  //
  // A custom property resolves its `var()`s on the element that DECLARES it,
  // not on the element that uses it. So a token declared on `:root` whose value
  // references a token that only exists lower down — on a layout wrapper, on a
  // `data-accent` element — substitutes the fallback at `:root` and inherits
  // that already-wrong value everywhere.
  //
  // It cost a blue starburst on a green page, and then the entire marketing
  // surface silently rendering in SF Pro instead of the face next/font had just
  // loaded. Neither errored, and neither was visible to the build or to tsc.
  //
  // Each of these must be re-declared in a scope where its dependency exists.
  const LAZY_TOKENS = [
    { token: '--ray-fan', dependsOn: '--family-accent', reDeclaredIn: BRAND_CSS },
    { token: '--font-sans', dependsOn: '--font-display-sans', reDeclaredIn: MARKETING_CSS },
    { token: '--font-mono', dependsOn: '--font-display-mono', reDeclaredIn: MARKETING_CSS },
  ]

  it.each(LAZY_TOKENS)('$token is re-substituted below :root', ({ token, reDeclaredIn }) => {
    // Once on `:root` in brand.css, and at least once more somewhere that owns
    // the dependency. A single declaration means the bug is back.
    const declarations = [...reDeclaredIn.matchAll(new RegExp(`${token}\\s*:`, 'g'))].length
    const inBrand = [...BRAND_CSS.matchAll(new RegExp(`${token}\\s*:`, 'g'))].length
    expect(inBrand + (reDeclaredIn === BRAND_CSS ? 0 : declarations)).toBeGreaterThanOrEqual(2)
  })

  it.each(LAZY_TOKENS)('$token still references $dependsOn', ({ token, dependsOn }) => {
    const declaration = BRAND_CSS.slice(BRAND_CSS.indexOf(`${token}:`))
    expect(declaration.slice(0, 200)).toContain(`var(${dependsOn}`)
  })

  it('the font tokens carry an in-var fallback', () => {
    // `var(--x)` with no fallback makes the whole `font-family` declaration
    // invalid rather than falling through, so a surface that has not loaded the
    // faces loses its type entirely instead of rendering the system stack.
    expect(TOKENS.get('--font-sans')).toMatch(/var\(--font-display-sans,\s*'/)
    expect(TOKENS.get('--font-mono')).toMatch(/var\(--font-display-mono,\s*'/)
  })
})

describe('no collision with the token systems already in the app', () => {
  // This one is a regression test with a scar. `brand.css` originally called
  // the family token `--accent`, which is also shadcn's. Tailwind flattens its
  // `@layer base` into plain rules rather than a native CSS layer, so
  // `globals.css` — imported after — quietly won at `:root`, and every
  // `var(--accent)` outside a `data-accent` wrapper resolved to the HSL triplet
  // `210 40% 96.1%` instead of a colour. Nothing errored; the ray fan just
  // stopped drawing.
  const SHADCN_OWNED = [
    '--background',
    '--foreground',
    '--card',
    '--popover',
    '--primary',
    '--secondary',
    '--muted',
    '--accent',
    '--destructive',
    '--border',
    '--input',
    '--ring',
    '--radius',
  ]

  it.each(SHADCN_OWNED)('brand.css does not declare %s', (name) => {
    // `--radius-8` and friends must not trip this, so match a whole declaration.
    const declares = new RegExp(`${name}\\s*:`, 'g')
    const hits = [...BRAND_CSS.matchAll(declares)].filter((m) => {
      const after = BRAND_CSS.slice((m.index ?? 0) + name.length)
      return after.startsWith(':')
    })
    expect(hits, `${name} belongs to shadcn in globals.css`).toHaveLength(0)
  })

  it('does not declare a --pf-* token either', () => {
    expect(BRAND_CSS).not.toMatch(/--pf-[a-z-]+\s*:/)
  })
})

describe('one definition per value', () => {
  it('the marketing stylesheet declares no brand hex of its own', () => {
    // `brand.css` is the single definition. A hex reappearing in a consuming
    // stylesheet is how the second, stale copy gets born.
    const known = [
      ...Object.values(SPECTRUM),
      ...Object.values(TINTS),
      // Black and white are excluded: they appear as mask channels in
      // `mask-image`, where the value is an alpha ramp rather than a colour.
      INK.warm,
      INK.slate,
      INK.mist,
      INK.paper,
    ]
    for (const hex of known) {
      const found = new RegExp(hex.replace('#', '#'), 'i').test(MARKETING_CSS)
      expect(found, `${hex} is hard-coded in marketing.css`).toBe(false)
    }
  })

  it('tailwind points at the variables rather than repeating the hexes', () => {
    for (const name of Object.keys(SPECTRUM)) {
      expect(TAILWIND).toContain(`var(--brand-${kebab(name)})`)
    }
    for (const name of Object.keys(TINTS)) {
      expect(TAILWIND).toContain(`var(--tint-${kebab(name)})`)
    }
    for (const hex of Object.values(SPECTRUM)) {
      expect(TAILWIND.toUpperCase(), `${hex} is hard-coded in tailwind.config.ts`).not.toContain(
        hex.toUpperCase(),
      )
    }
  })
})

describe('the tokens reach the whole app', () => {
  it('globals.css imports the brand sheet', () => {
    // Marketing is the first surface built on these, not the only one allowed
    // to use them. If this import goes, every `var(--brand-*)` outside the
    // marketing route group silently resolves to nothing.
    expect(read('src/app/globals.css')).toContain("@import '../styles/brand.css';")
  })

  it('defines the tokens on :root rather than under a scope', () => {
    const firstSelector = BRAND_CSS.slice(BRAND_CSS.indexOf('*/') + 2).match(/([^{}]+)\{/)?.[1]
    expect(firstSelector?.trim()).toBe(':root')
  })

  it('derives its greys instead of hard-coding them', () => {
    // The rule that makes the theme flip on two values. A literal grey here is
    // a token that will not invert with the rest.
    for (const token of [
      '--theme-fg-muted',
      '--theme-border',
      '--theme-card-bg',
      '--theme-input-bg',
    ]) {
      expect(TOKENS.get(token), token).toContain('color-mix')
    }
  })

  it('flips the theme by swapping exactly the two values', () => {
    const dark = BRAND_CSS.slice(BRAND_CSS.indexOf(".dark,\n[data-theme='dark']"))
    const block = dark.slice(dark.indexOf('{'), dark.indexOf('}'))
    const overridden = [...block.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
    // `--theme-card-bg` is the one documented exception: a raised surface needs
    // more lift out of black than out of white.
    expect(new Set(overridden)).toEqual(
      new Set(['--theme-bg', '--theme-fg', '--theme-card-bg']),
    )
  })
})
