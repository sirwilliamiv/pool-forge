import { describe, expect, it } from 'vitest'
import { isOccluded } from '@/modules/guide/resolve'

function fakeElement(overrides: Partial<Element> & { hit?: Element | null }): Element {
  const el = {
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 40 }) as DOMRect,
    contains: (other: Node | null) => other === el,
    ownerDocument: {
      defaultView: { innerWidth: 1280, innerHeight: 800 },
      elementFromPoint: () => overrides.hit ?? null,
    },
  } as unknown as Element
  return Object.assign(el, overrides)
}

describe('isOccluded', () => {
  it('is not occluded when the hit test returns the element itself', () => {
    const el = fakeElement({})
    ;(el.ownerDocument as Document).elementFromPoint = () => el
    expect(isOccluded(el)).toBe(false)
  })

  it('is occluded when another element covers its centre', () => {
    const cover = fakeElement({})
    const el = fakeElement({ hit: cover })
    expect(isOccluded(el)).toBe(true)
  })

  it('off-viewport is not occluded: scrolling fixes it, covering does not', () => {
    const el = fakeElement({})
    ;(el as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 10, top: 2000, width: 100, height: 40 }) as DOMRect
    expect(isOccluded(el)).toBe(false)
  })
})
