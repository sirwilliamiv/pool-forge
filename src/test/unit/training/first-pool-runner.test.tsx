/** @vitest-environment jsdom */

// The tour is click-through so a line is never cut off: it never advances on its
// own (unless Auto is toggled on, and then only when the line has truly ended).
// These assert that — an object drops a beat after its card opens, Next always
// performs the current action before moving on, Back never rebuilds, and Auto
// advances only on the narrator's own 'ended' — with dispatch and the narrator
// mocked so we see exactly which command fired when.

import * as React from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'proj_sandbox' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/projects/actions', () => ({ deleteProject: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/commands/dispatch', () => ({
  dispatch: vi.fn(async (id: string) => {
    if (id === 'add.shape') return { ok: true, data: { shapeId: 'shape_pool_1' } }
    return { ok: true, data: {} }
  }),
}))

let lastOnEnded: (() => void) | null = null
const narrationControls = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() }
vi.mock('@/components/editor/training/narrator', () => ({
  narrate: vi.fn((_text: string, onEnded: () => void) => {
    lastOnEnded = onEnded
    return narrationControls
  }),
}))

import { dispatch } from '@/lib/commands/dispatch'
import { FirstPoolTraining } from '@/components/editor/training/FirstPoolTraining'
import { FIRST_POOL_SCRIPT } from '@/modules/editor/training/first-pool-script'

const dispatchMock = vi.mocked(dispatch)
const ACT_DELAY = 900

const NON_BUILD = new Set(['guide.point', 'guide.clear', 'canvas.fit', 'camera.set.view', 'view.set.tab'])
function buildCommands(): string[] {
  return dispatchMock.mock.calls.map(c => c[0] as string).filter(id => !NON_BUILD.has(id))
}
function countOf(id: string): number {
  return dispatchMock.mock.calls.filter(c => c[0] === id).length
}
function clickNext(): void {
  act(() => {
    screen.getByRole('button', { name: /next|finish/i }).click()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  dispatchMock.mockClear()
  narrationControls.stop.mockClear()
  lastOnEnded = null
  window.history.replaceState({}, '', '/projects/proj_sandbox/editor?training=first-pool')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the first-pool training runner', () => {
  it('renders nothing when the training flag is absent', () => {
    window.history.replaceState({}, '', '/projects/proj_sandbox/editor')
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.queryByText(/Marco · step/)).toBeNull()
  })

  it('drops the card\'s object a beat after it opens, and never advances on its own', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickNext() // step 1: the pool card
    expect(buildCommands()).toEqual([]) // nothing yet — the words come first
    await act(async () => {
      vi.advanceTimersByTime(ACT_DELAY + 50)
    })
    expect(buildCommands()).toEqual(['add.shape']) // object dropped
    // Wait a long time: still on the same card, no further build. No auto-jump.
    await act(async () => {
      vi.advanceTimersByTime(30000)
    })
    expect(buildCommands()).toEqual(['add.shape'])
    expect(screen.getByText(/step 2 of/i)).toBeTruthy()
  })

  it('Next performs the current action even when clicked before it auto-fires', () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickNext() // to step 1 (pool)
    clickNext() // click through before the 900ms drop
    expect(buildCommands()).toContain('add.shape')
  })

  it('Back revisits a card without rebuilding its object', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickNext() // step 1 (pool)
    await act(async () => {
      vi.advanceTimersByTime(ACT_DELAY + 50)
    })
    expect(countOf('add.shape')).toBe(1)
    act(() => {
      screen.getByRole('button', { name: /back/i }).click()
    }) // back to step 0
    clickNext() // forward to step 1 again
    await act(async () => {
      vi.advanceTimersByTime(ACT_DELAY + 50)
    })
    expect(countOf('add.shape')).toBe(1) // not rebuilt
  })

  it('Auto advances only when the line finishes', () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    act(() => {
      screen.getByRole('button', { name: /auto/i }).click()
    })
    expect(screen.getByText(/step 1 of/i)).toBeTruthy()
    // The line ends -> auto advances one card.
    act(() => {
      lastOnEnded?.()
    })
    expect(screen.getByText(/step 2 of/i)).toBeTruthy()
  })

  it('clears the highlight and stops narration when the training unmounts', () => {
    const { unmount } = render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    dispatchMock.mockClear()
    unmount()
    expect(dispatchMock.mock.calls.some(c => c[0] === 'guide.clear')).toBe(true)
    expect(narrationControls.stop).toHaveBeenCalled()
  })

  it('Finish on the last card shows the end panel, and every build step ran', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    for (let i = 0; i < FIRST_POOL_SCRIPT.length; i++) {
      clickNext()
      // flush the dispatch promise (add.shape capture) between cards
      await act(async () => {
        vi.advanceTimersByTime(0)
      })
    }
    const expected = FIRST_POOL_SCRIPT.filter(s => {
      const a = s.run?.({ poolId: 'shape_pool_1' })
      return a && !NON_BUILD.has(a.command)
    }).length
    expect(buildCommands().length).toBe(expected)
    expect(screen.getByText(/complete pool/i)).toBeTruthy()
  })
})
