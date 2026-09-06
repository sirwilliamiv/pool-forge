/** @vitest-environment jsdom */

// The tour begins on a Start click (which is what lets Marco's audio play) and
// then advances on his line actually ending — the narrator's own 'ended' — so a
// line is never cut off and it never drags. These assert that: nothing happens
// before Start, an object drops a beat after its card, ending a line advances,
// Pause freezes it, Next skips, Back never rebuilds, and Finish ends the tour.

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
const ACT_DROP = 700

const NON_BUILD = new Set(['guide.point', 'guide.clear', 'canvas.fit', 'camera.set.view', 'view.set.tab'])
function buildCommands(): string[] {
  return dispatchMock.mock.calls.map(c => c[0] as string).filter(id => !NON_BUILD.has(id))
}
function countOf(id: string): number {
  return dispatchMock.mock.calls.filter(c => c[0] === id).length
}
function clickStart(): void {
  act(() => {
    screen.getByRole('button', { name: /start the tour/i }).click()
  })
}
function clickNext(): void {
  act(() => {
    screen.getByRole('button', { name: /next|finish/i }).click()
  })
}
// Simulate Marco finishing the current line.
function endLine(): void {
  act(() => {
    lastOnEnded?.()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  dispatchMock.mockClear()
  narrationControls.pause.mockClear()
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
    expect(screen.queryByText(/Marco/)).toBeNull()
  })

  it('does nothing until Start is clicked, then narrates the first card', () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(lastOnEnded).toBeNull() // no narration before the gesture
    clickStart()
    expect(lastOnEnded).not.toBeNull()
    expect(screen.getByText(/step 1 of/i)).toBeTruthy()
  })

  it('drops the card\'s object a beat after it opens, and advances when the line ends', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickStart()
    endLine() // step 1 (intro, no build) -> step 2 (pool)
    expect(buildCommands()).toEqual([]) // words first
    await act(async () => {
      vi.advanceTimersByTime(ACT_DROP + 50)
    })
    expect(buildCommands()).toEqual(['add.shape']) // object dropped
    expect(screen.getByText(/step 2 of/i)).toBeTruthy()
  })

  it('does not advance while paused, even when the line ends', () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickStart()
    act(() => {
      screen.getByRole('button', { name: /pause/i }).click()
    })
    expect(narrationControls.pause).toHaveBeenCalled()
    endLine() // line ends while paused -> must NOT advance
    expect(screen.getByText(/step 1 of/i)).toBeTruthy()
  })

  it('Next skips ahead and performs the current action', () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickStart()
    clickNext() // step 1 -> step 2 (pool)
    clickNext() // performs the pool action on the way out
    expect(buildCommands()).toContain('add.shape')
  })

  it('Back revisits a card without rebuilding its object', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickStart()
    clickNext() // step 2 (pool)
    await act(async () => {
      vi.advanceTimersByTime(ACT_DROP + 50)
    })
    expect(countOf('add.shape')).toBe(1)
    act(() => {
      screen.getByRole('button', { name: /back/i }).click()
    })
    clickNext()
    await act(async () => {
      vi.advanceTimersByTime(ACT_DROP + 50)
    })
    expect(countOf('add.shape')).toBe(1)
  })

  it('clears the highlight and stops narration when the training unmounts', () => {
    const { unmount } = render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    clickStart()
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
    clickStart()
    for (let i = 0; i < FIRST_POOL_SCRIPT.length; i++) {
      clickNext()
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
