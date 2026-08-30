import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { LOADING_MIN_MS, holdRemaining } from '@/lib/loading-rhythm'
import { PageLoading } from '@/components/monitoring/PageLoading'

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

describe('the loading pool holdover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.runAllTimers()
    vi.useRealTimers()
    document.querySelector('[data-loading-hold]')?.remove()
  })

  const holdover = () => document.querySelector('[data-loading-hold]')

  // The rule the hold exists for: a page that arrives instantly must not blink
  // the pool away. The fallback unmounts, the clone stays for the minimum.
  it('outlives a fast page and holds for the minimum', () => {
    const { unmount } = render(<PageLoading what="this project" />)
    vi.advanceTimersByTime(50)
    unmount()
    expect(holdover()?.getAttribute('data-loading-hold')).toBe('shown')
    vi.advanceTimersByTime(LOADING_MIN_MS - 60)
    expect(holdover()?.getAttribute('data-loading-hold')).toBe('shown')
    vi.advanceTimersByTime(60)
    expect(holdover()?.getAttribute('data-loading-hold')).toBe('leaving')
    vi.advanceTimersByTime(300)
    expect(holdover()).toBeNull()
  })

  it('holds a clone of the pool, not a different screen', () => {
    const { unmount } = render(<PageLoading what="the price book" />)
    vi.advanceTimersByTime(50)
    unmount()
    expect(holdover()?.textContent).toContain('Loading the price book')
    expect(holdover()?.querySelector('svg')).not.toBeNull()
  })

  it('owes nothing when the page took longer than the minimum', () => {
    const { unmount } = render(<PageLoading />)
    vi.advanceTimersByTime(LOADING_MIN_MS + 500)
    unmount()
    expect(holdover()).toBeNull()
  })

  it('clears the holdover when the next fallback mounts', () => {
    const first = render(<PageLoading />)
    vi.advanceTimersByTime(50)
    first.unmount()
    expect(holdover()).not.toBeNull()
    render(<PageLoading />)
    // The live fallback is on screen; the clone's job is done.
    expect(holdover()).toBeNull()
  })
})
