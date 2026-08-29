import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { BRAND_COLORS, BRAND_FONT_SIZES, cn } from '@/lib/utils'

// tailwind-merge decides what conflicts by parsing class names against scales
// it knows. It does not know ours. Before `cn` was taught them, this happened:
//
//   twMerge('text-theme-bg text-bodyL')  ->  'text-bodyL'
//
// A size and a colour were judged to be the same kind of `text-*` utility, so
// the colour was dropped, the element inherited its parent's ink, and the
// primary button shipped as black text on a black fill in 29 files. The
// generated CSS was correct the whole time; the class was simply never on the
// element, which is why nothing failed and only a screenshot caught it.
//
// These are the assertions that would have caught it.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const TAILWIND = readFileSync(resolve(ROOT, 'tailwind.config.ts'), 'utf8')

describe('a brand size and a brand colour are not the same utility', () => {
  it('keeps both when a colour is followed by a size', () => {
    expect(cn('text-theme-bg', 'text-bodyL')).toContain('text-theme-bg')
    expect(cn('text-theme-bg', 'text-bodyL')).toContain('text-bodyL')
  })

  it('keeps both in either order', () => {
    expect(cn('text-bodyL', 'text-theme-bg')).toContain('text-theme-bg')
    expect(cn('text-bodyL', 'text-theme-bg')).toContain('text-bodyL')
  })

  it('survives the real primary-button class string', () => {
    // The exact shape `buttonVariants` produces: base, then variant, then size.
    const merged = cn(
      'inline-flex items-center justify-center rounded-brand font-medium',
      'bg-theme-fg text-theme-bg',
      'h-[2.875rem] px-[1.375rem] text-bodyL',
    )
    expect(merged, 'the button lost its ink again').toContain('text-theme-bg')
    expect(merged).toContain('bg-theme-fg')
    expect(merged).toContain('text-bodyL')
  })

  it.each([...BRAND_FONT_SIZES])('text-%s does not eat a colour', (size) => {
    expect(cn('text-theme-fg', `text-${size}`)).toContain('text-theme-fg')
  })
})

describe('same-group classes still collapse the way they should', () => {
  it('a later size replaces an earlier size', () => {
    expect(cn('text-bodyL', 'text-title1')).toBe('text-title1')
  })

  it('a later colour replaces an earlier colour', () => {
    expect(cn('text-theme-fg', 'text-brand-green')).toBe('text-brand-green')
  })

  it('a caller override still wins, which is the point of cn', () => {
    // Every component takes `className` last so a caller can override.
    expect(cn('bg-theme-fg text-theme-bg', 'bg-brand-green')).toContain('bg-brand-green')
    expect(cn('bg-theme-fg text-theme-bg', 'bg-brand-green')).not.toContain('bg-theme-fg')
  })
})

describe('the declared scales match the Tailwind config', () => {
  // Two lists of the same thing drift. The merge config is invisible until it
  // is wrong, so it is worth asserting rather than remembering.
  it.each([...BRAND_FONT_SIZES])('%s is a real fontSize', (size) => {
    expect(TAILWIND).toContain(`${size}: [`)
  })

  it.each([...BRAND_COLORS])('%s is a real colour', (color) => {
    const [group, name] = color.split('-')
    expect(TAILWIND, `${color} is declared to cn but not to Tailwind`).toContain(`${group}: {`)
    expect(TAILWIND).toContain(`${name}:`)
  })
})
