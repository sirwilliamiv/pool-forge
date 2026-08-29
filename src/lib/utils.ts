import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `cn` has to be told about the brand scale, or it silently eats colours.
//
// tailwind-merge decides which classes conflict by parsing the class name. It
// knows `text-sm` is a size and `text-red-500` is a colour because it knows
// Tailwind's default scales. It knows nothing about ours, so given
// `text-theme-bg text-bodyL` it assumed both were the same kind of `text-*`
// utility, called them a conflict, and kept the last one:
//
//   twMerge('text-theme-bg text-bodyL')  ->  'text-bodyL'
//
// The colour was dropped, the element inherited its parent's ink, and the
// primary button rendered black text on a black fill. Nothing errored, the
// generated CSS was correct, and the class was simply never on the element.
// It took a screenshot to find, which is the whole problem with this class of
// bug.
//
// So both custom scales are declared here. Anything added to `fontSize` or to
// the brand colour groups in `tailwind.config.ts` needs adding here too, and
// `src/test/unit/brand/class-merge.test.ts` will fail if it is not.

/** The named type scale from `docs/brand-bible.md`, as `text-*` font sizes. */
const BRAND_FONT_SIZES = [
  'display1',
  'display2',
  'title1',
  'title2',
  'title3',
  'title4',
  'bodyXL',
  'bodyL',
  'bodyS',
  'badge',
  'formLabel',
] as const

/** The brand colour groups, as they appear after `text-` / `bg-` / `border-`. */
const BRAND_COLORS = [
  'brand-orange',
  'brand-red',
  'brand-purple',
  'brand-blue',
  'brand-green',
  'brand-uiBlue',
  'ink-black',
  'ink-warm',
  'ink-slate',
  'ink-mist',
  'ink-paper',
  'ink-white',
  'tint-ice',
  'tint-paleBlue',
  'tint-mint',
  'tint-honeydew',
  'tint-sage',
  'tint-sand',
  'tint-blush',
  'tint-lilac',
  'tint-periwinkle',
  'tint-orchid',
  'tint-aqua',
  'tint-slateMist',
  'theme-bg',
  'theme-fg',
  'theme-muted',
  'theme-faint',
  'theme-line',
  'theme-lineSoft',
  'theme-card',
  'theme-field',
  'family-accent',
  'family-tint',
  'family-tint2',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...BRAND_FONT_SIZES] }],
      'text-color': [{ text: [...BRAND_COLORS] }],
      'bg-color': [{ bg: [...BRAND_COLORS] }],
      'border-color': [{ border: [...BRAND_COLORS] }],
      'font-family': [{ font: ['display', 'brandMono'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { BRAND_COLORS, BRAND_FONT_SIZES }
