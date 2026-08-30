import { describe, expect, it } from 'vitest'
import { isOccluded, resolveTarget } from '@/modules/guide/resolve'

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

describe('resolveTarget selector and within', () => {
  function box(el: Element) {
    ;(el as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 5, top: 5, width: 50, height: 20 }) as DOMRect
  }

  it('a selector target resolves a non-interactive carrier', () => {
    document.body.innerHTML = '<div role="group" aria-label="View cube"></div>'
    const el = document.querySelector('[aria-label="View cube"]')!
    box(el)
    document.elementFromPoint = () => el
    const found = resolveTarget(document, {
      id: 'view.cube', name: 'View cube', screen: 'editor',
      selector: '[aria-label="View cube"]', explain: 'x',
    })
    expect(found).toBe(el)
  })

  it('within narrows a duplicated name to its container', () => {
    document.body.innerHTML =
      '<nav><button>Materials</button></nav>' +
      '<aside data-guide-scope="left-panel"><button>Materials</button></aside>'
    const wanted = document.querySelector('aside button')!
    for (const el of document.querySelectorAll('button')) box(el)
    document.elementFromPoint = () => wanted
    const found = resolveTarget(document, {
      id: 'panel.materials', name: 'Materials', screen: 'editor',
      within: '[data-guide-scope="left-panel"]', explain: 'x',
    })
    expect(found).toBe(wanted)
  })
})
