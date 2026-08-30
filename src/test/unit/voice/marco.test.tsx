import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { Marco } from '@/components/voice/Marco'
import { INK, SPECTRUM, TINTS } from '@/lib/brand'

describe('Marco', () => {
  // The one rule. He stands over the drawing, and on this product the drawing
  // is the whole point, so he must never cost a click.
  it('never takes a pointer event', () => {
    const { container } = render(<Marco state="idle" />)
    const stage = container.firstElementChild as HTMLElement
    expect(stage.style.pointerEvents).toBe('none')
  })

  it('reserves exactly the space it was given', () => {
    const { container } = render(<Marco state="idle" size={120} />)
    const stage = container.firstElementChild as HTMLElement
    expect(stage.style.width).toBe('120px')
    expect(stage.style.height).toBe('120px')
  })

  // The character loads asynchronously and draws to canvas. If it cannot, the
  // voice session still has to work: he is decoration on a working feature.
  it('renders a stage even before the character has loaded', () => {
    const { container } = render(<Marco state="listening" />)
    expect(container.firstElementChild).not.toBeNull()
  })

  it('survives being unmounted while still loading', () => {
    const { unmount } = render(<Marco state="idle" />)
    expect(() => unmount()).not.toThrow()
  })
})

// The vendored character is exempt from `brand/palette.test.ts`, which only
// reads `src/components` and `src/app`. That exemption is what these cover: it
// wears the brand because a palette is passed in, and the moment somebody
// shortcuts that by typing a brand hex into the vendor file, the one-definition
// rule is gone and nothing else would notice.
describe('Marco wears the brand', () => {
  const vendor = readFileSync(
    join(process.cwd(), 'src/vendor/marco/character.js'),
    'utf8',
  )
  const skin = readFileSync(
    join(process.cwd(), 'src/components/voice/Marco.tsx'),
    'utf8',
  )

  it('keeps every brand colour out of the vendored character', () => {
    const brandHexes = [
      ...Object.values(SPECTRUM),
      ...Object.values(TINTS),
      // Black and white are not anybody's brand colour, and the character
      // draws real shadows and highlights with them.
      ...Object.values(INK).filter((h) => h !== INK.black && h !== INK.white),
    ]
    const found = brandHexes.filter((hex) =>
      vendor.toLowerCase().includes(hex.toLowerCase()),
    )
    expect(found).toEqual([])
  })

  it('passes the spectrum in rather than naming colours twice', () => {
    expect(skin).toContain('palette: BRAND_PALETTE')
    for (const hue of ['green', 'orange', 'blue', 'red', 'purple'] as const) {
      expect(skin).toContain(`SPECTRUM.${hue}`)
    }
    // No hex literal in the skin either: it reads `lib/brand.ts` or nothing.
    expect(skin).not.toMatch(/#[0-9a-fA-F]{6}\b/)
  })

  it('points with a colour that does not mean something is wrong', () => {
    // Amber warns and red errors, so the ring dropped onto a live control
    // must be neither, or pointing at a button reads as breaking it.
    const accent = skin.match(/accent: SPECTRUM\.(\w+)/)?.[1]
    expect(accent).toBeDefined()
    expect(['uiBlue', 'blue', 'green', 'purple']).toContain(accent)
  })
})
