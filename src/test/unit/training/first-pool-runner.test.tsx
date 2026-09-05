/** @vitest-environment jsdom */

// The runner's whole job is pacing: announce first, act second, never both at
// once, and always slow enough for a human to follow. These assert that
// contract — the ordering, that Pause freezes it, that Next skips the wait, and
// that leaving clears the highlight — against the real script and a mocked
// dispatch so we can watch exactly which command fired when.

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
    // add.shape must return a shape id so the depth step can reference it.
    if (id === 'add.shape') return { ok: true, data: { shapeId: 'shape_pool_1' } }
    return { ok: true, data: {} }
  }),
}))

import { dispatch } from '@/lib/commands/dispatch'
import { FirstPoolTraining } from '@/components/editor/training/FirstPoolTraining'
import { FIRST_POOL_SCRIPT } from '@/modules/editor/training/first-pool-script'

const dispatchMock = vi.mocked(dispatch)

const ANNOUNCE = 2500
const SETTLE = 1500

/** Commands the runner issues to point/clear, not to build. */
const GUIDE = new Set(['guide.point', 'guide.clear'])

function buildCommands(): string[] {
  return dispatchMock.mock.calls.map(c => c[0] as string).filter(id => !GUIDE.has(id))
}

// One beat transition per flush: a beat's timer fires and updates state, but the
// NEXT beat's timer is only scheduled after React re-renders. Advancing all the
// time in one call would fire only the first timer, so pump one beat at a time.
async function pump(transitions: number): Promise<void> {
  for (let i = 0; i < transitions; i++) {
    // Async act flushes the dispatch promise (and its capture .then) as well as
    // the timer, so a step that depends on an earlier step's result sees it.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    await act(async () => {
      vi.advanceTimersByTime(ANNOUNCE + SETTLE + 1000)
    })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  dispatchMock.mockClear()
  // The training only runs when the URL says so.
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
    // The active flag is read in an effect; flush it.
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.queryByText(/Marco · step/)).toBeNull()
  })

  it('announces before it acts: no build command fires during the announce hold', () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    // Step 1 is narration-only, so advance to step 2 (the first that builds).
    // Announce beat of step 1 -> act (nothing) -> announce of step 2.
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE)
    }) // step 1 announce done -> act
    act(() => {
      vi.advanceTimersByTime(SETTLE)
    }) // step 1 act done -> step 2 announce
    // We are now in step 2's announce hold. The pool must NOT be added yet.
    expect(buildCommands()).toEqual([])
    // Complete the announce hold; now the act fires.
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE)
    })
    expect(buildCommands()).toEqual(['add.shape'])
  })

  it('pauses: no further command fires while paused, and resuming continues', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    // Reach step 2's act so the pool is added: s1 announce->act, s1 act->s2
    // announce, s2 announce->act (fires add.shape) = 3 transitions.
    await pump(3)
    expect(buildCommands()).toEqual(['add.shape'])

    // Pause, then let a long time pass: nothing new should fire.
    act(() => {
      screen.getByTitle('Pause').click()
    })
    const before = buildCommands().length
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE * 5)
    })
    expect(buildCommands().length).toBe(before)

    // Resume: the sequence moves again.
    act(() => {
      screen.getByTitle('Resume').click()
    })
    await pump(3)
    expect(buildCommands().length).toBeGreaterThan(before)
  })

  it('Next skips the current wait', () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    // In step 1's announce hold. Next should jump straight to the act beat
    // without waiting the full ANNOUNCE, then Next again into step 2's announce.
    act(() => {
      screen.getByTitle('Next').click()
    }) // -> step 1 act
    act(() => {
      screen.getByTitle('Next').click()
    }) // -> step 2 announce
    act(() => {
      screen.getByTitle('Next').click()
    }) // -> step 2 act (fires add.shape), no full holds waited
    expect(buildCommands()).toEqual(['add.shape'])
  })

  it('clears the highlight when the training unmounts', () => {
    const { unmount } = render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    dispatchMock.mockClear()
    unmount()
    const cleared = dispatchMock.mock.calls.some(c => c[0] === 'guide.clear')
    expect(cleared).toBe(true)
  })

  it('runs every build step by the end and shows the finish panel', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    // Walk the whole script: two beats per step, plus slack to reach the end.
    await pump(FIRST_POOL_SCRIPT.length * 2 + 2)
    // Every step with a run() that returns an action should have dispatched.
    const expected = FIRST_POOL_SCRIPT.filter(s => s.run && s.run({ poolId: 'shape_pool_1' })).length
    expect(buildCommands().length).toBe(expected)
    expect(screen.getByText(/complete pool/i)).toBeTruthy()
  })
})
