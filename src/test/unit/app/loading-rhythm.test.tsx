import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { LOADING_MIN_MS, holdRemaining } from '@/lib/loading-rhythm'
import { LoadingScreen } from '@/components/dashboard/LoadingScreen'

describe('the loading rhythm', () => {
  it('owes nothing when the screen never appeared', () => {
    expect(holdRemaining(null, 1_000)).toBe(0)
  })

  it('owes the remainder of the minimum when the screen just appeared', () => {
    expect(holdRemaining(1_000, 1_080)).toBe(LOADING_MIN_MS - 80)
  })

  it('owes nothing once the minimum has already passed', () => {
    expect(holdRemaining(1_000, 1_000 + LOADING_MIN_MS + 400)).toBe(0)
  })

  it('never owes a negative hold', () => {
    expect(holdRemaining(0, Number.MAX_SAFE_INTEGER)).toBe(0)
  })
})

describe('the loading screen overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.runAllTimers()
    vi.useRealTimers()
    document.getElementById('pf-route-loading')?.remove()
  })

  const overlay = () => document.getElementById('pf-route-loading')

  it('appears when the fallback mounts', () => {
    render(<LoadingScreen />)
    expect(overlay()).not.toBeNull()
    expect(overlay()?.getAttribute('role')).toBe('status')
  })

  // The rule the component exists for: a page that arrives instantly must not
  // blink the screen away, it stays for the minimum and then fades.
  it('outlives a fast page and holds for the minimum', () => {
    const { unmount } = render(<LoadingScreen />)
    vi.advanceTimersByTime(50)
    unmount()
    expect(overlay()?.getAttribute('data-loading-screen')).toBe('shown')
    vi.advanceTimersByTime(LOADING_MIN_MS - 60)
    expect(overlay()?.getAttribute('data-loading-screen')).toBe('shown')
    vi.advanceTimersByTime(60)
    expect(overlay()?.getAttribute('data-loading-screen')).toBe('leaving')
    vi.advanceTimersByTime(300)
    expect(overlay()).toBeNull()
  })

  it('leaves promptly when the page took longer than the minimum', () => {
    const { unmount } = render(<LoadingScreen />)
    vi.advanceTimersByTime(LOADING_MIN_MS + 500)
    unmount()
    vi.advanceTimersByTime(1)
    expect(overlay()?.getAttribute('data-loading-screen')).toBe('leaving')
    vi.advanceTimersByTime(300)
    expect(overlay()).toBeNull()
  })

  it('reuses the overlay across back-to-back navigations instead of blinking', () => {
    const first = render(<LoadingScreen />)
    vi.advanceTimersByTime(50)
    first.unmount()
    const held = overlay()
    expect(held).not.toBeNull()
    render(<LoadingScreen />)
    vi.advanceTimersByTime(LOADING_MIN_MS * 3)
    // The second mount cancelled the first exit and the overlay is the same
    // node, still up, waiting on the second navigation.
    expect(overlay()).toBe(held)
    expect(overlay()?.getAttribute('data-loading-screen')).toBe('shown')
  })
})
