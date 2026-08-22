// "Show me the quote" has to be visible. These pin the two things that make it
// so: the panel comes forward, and asking twice flashes twice.

import { beforeEach, describe, expect, it } from 'vitest'

import { useViewStore } from '@/modules/editor/state/viewStore'

describe('focusPanel', () => {
  beforeEach(() => {
    useViewStore.setState({ leftTab: 'layers', rightTab: 'design', focusedPanel: null, focusNonce: 0 })
  })

  it('brings the panel forward, not just highlights it', () => {
    // Being told where something is helps nobody if it is behind another tab.
    useViewStore.getState().focusPanel('quote')
    expect(useViewStore.getState().rightTab).toBe('quote')

    useViewStore.getState().focusPanel('materials')
    expect(useViewStore.getState().leftTab).toBe('materials')
  })

  it('advances the nonce so asking twice flashes twice', () => {
    // The target does not change on the second ask, so without the nonce React
    // sees no state change and nothing happens.
    useViewStore.getState().focusPanel('quote')
    const first = useViewStore.getState().focusNonce
    useViewStore.getState().focusPanel('quote')
    expect(useViewStore.getState().focusNonce).toBeGreaterThan(first)
  })

  it('leaves the other side alone', () => {
    useViewStore.getState().focusPanel('quote')
    expect(useViewStore.getState().leftTab).toBe('layers')
  })

  it('focuses the validation dock without touching either tab', () => {
    useViewStore.getState().focusPanel('validation')
    expect(useViewStore.getState().focusedPanel).toBe('validation')
    expect(useViewStore.getState().leftTab).toBe('layers')
    expect(useViewStore.getState().rightTab).toBe('design')
  })
})
