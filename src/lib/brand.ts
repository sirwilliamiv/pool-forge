// The brand bible's palette, as values rather than as CSS variables.
//
// Most of the app should reach for the CSS custom properties in
// `src/styles/brand.css` or the Tailwind utilities built from them, because
// those follow the theme and the accent family for free. This file exists for
// the three places that cannot read a CSS variable:
//
//   - three.js materials, which take a colour, not a computed style;
//   - export documents, which are rendered to a standalone HTML file with its
//     own inlined CSS and no access to the app's `:root`;
//   - anywhere a hex has to be handed to a canvas, a PDF or a third party.
//
// These are the same hexes as `brand.css`. Two definitions of one value is a
// thing that drifts, so `src/test/unit/brand/tokens.test.ts` parses the CSS and
// asserts they match. If you change one, change both, and the test will tell
// you if you did not.

/**
 * The five hues, plus the UI blue.
 *
 * Green does double duty: it is the only core hue allowed to run full-bleed as
 * a surface, and it carries the announcement bar. The other four appear almost
 * exclusively inside the mark and inside illustration — never as body text, a
 * border or a button.
 */
export const SPECTRUM = {
  orange: '#FF7237',
  red: '#FF3737',
  purple: '#874FFF',
  blue: '#00B6FF',
  green: '#24CB71',
  uiBlue: '#0D99FF',
} as const

export const INK = {
  black: '#000000',
  warm: '#141413',
  slate: '#697485',
  mist: '#D2D9E2',
  paper: '#FAF9F5',
  white: '#FFFFFF',
} as const

export const TINTS = {
  ice: '#C7F8FB',
  paleBlue: '#E5F4FF',
  mint: '#CFF7D3',
  honeydew: '#F3FFE3',
  sage: '#95B9AC',
  sand: '#FADCA2',
  blush: '#FFC9C1',
  lilac: '#CB9FD2',
  periwinkle: '#C4BAFF',
  orchid: '#E28CF8',
  aqua: '#33DFDF',
  slateMist: '#D2D9E2',
} as const

export type SpectrumHue = keyof typeof SPECTRUM
export type Tint = keyof typeof TINTS

/**
 * The accent families.
 *
 * Each surface — a product area, a marketing page, a campaign — keeps the
 * identical black-on-white chassis and changes only its tint family. That is
 * the entire differentiation system: no per-surface typeface, layout or button
 * style. In CSS this is `data-accent="<name>"` on any wrapper; here it is for
 * code that has to pick the same colours without a DOM.
 *
 * `inverse` is deliberately not here. It is a sub-brand rather than a variant:
 * a charcoal ground, an acid accent and its own type rendering. If you are
 * extending the system, do not reach for it.
 */
export const ACCENT_FAMILIES = {
  signal: { accent: SPECTRUM.green, tint: TINTS.aqua, tint2: TINTS.lilac },
  azure: { accent: SPECTRUM.blue, tint: TINTS.paleBlue, tint2: TINTS.ice },
  vapour: { accent: SPECTRUM.blue, tint: TINTS.mint, tint2: TINTS.paleBlue },
  drift: { accent: SPECTRUM.blue, tint: TINTS.paleBlue, tint2: TINTS.mint },
  sandbar: { accent: SPECTRUM.orange, tint: TINTS.sand, tint2: TINTS.honeydew },
  dusk: { accent: SPECTRUM.purple, tint: TINTS.periwinkle, tint2: TINTS.lilac },
  sage: { accent: TINTS.sage, tint: TINTS.sage, tint2: TINTS.honeydew },
  meadow: { accent: TINTS.sage, tint: TINTS.honeydew, tint2: TINTS.mint },
  bloom: { accent: TINTS.orchid, tint: TINTS.blush, tint2: TINTS.lilac },
  frost: { accent: SPECTRUM.uiBlue, tint: TINTS.ice, tint2: TINTS.slateMist },
  neutral: { accent: INK.slate, tint: TINTS.slateMist, tint2: INK.paper },
} as const

export type AccentFamily = keyof typeof ACCENT_FAMILIES

/** The named type scale, in pixels. Sizes only; leading and tracking are in CSS. */
export const TYPE_SCALE = {
  display1: 72,
  display2: 44,
  title1: 36,
  title2: 32,
  title3: 24,
  title4: 22,
  bodyXL: 18,
  bodyL: 16,
  body: 14,
  badge: 12,
  formLabel: 11,
} as const

/**
 * The spacing ramp, in pixels. Everything stays on a multiple of four.
 *
 * 80 is the default section block padding and 120 is a major section break.
 */
export const SPACING = [4, 6, 8, 12, 16, 24, 32, 40, 56, 64, 80, 120] as const

/** The radius ladder, in pixels. `full` is 9999. */
export const RADII = [2, 4, 8, 12, 16, 24, 28] as const

/**
 * Both shadows in the system.
 *
 * Same 10% black, differing only in blur and offset. There is no mid step and
 * no coloured shadow anywhere. `two` belongs to the single overlapping element
 * in a composition; if two things in a frame have shadows, the hierarchy has
 * already collapsed.
 */
export const ELEVATION = {
  one: '0 4px 32px rgba(0, 0, 0, 0.10)',
  two: '0 24px 70px rgba(0, 0, 0, 0.10)',
} as const

/** The twelve-spoke starburst, for a given accent. */
export function rayFan(accent: string): string {
  return `repeating-conic-gradient(${accent} 0deg, ${accent} 18deg, transparent 18deg, transparent 30deg)`
}
