/** @vitest-environment jsdom */

// The runner's whole job is pacing: announce first, act second, never both at
// once, and hold each caption until Marco has actually finished speaking it.
// These assert that contract — the ordering, that a step never advances before
// narration ends, that Pause freezes it, that Next skips, and that leaving
// clears the highlight — against the real script with dispatch and the narrator
// mocked, so we control exactly when a line finishes and see which command fired.

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

// The narrator is mocked so a line "finishes" exactly when the test says. We
// capture the latest onEnded callback and the controls for the active line.
let lastOnEnded: (() => void) | null = null
const narrationControls = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() }
vi.mock('@/components/editor/training/narrator', () => ({
  narrate: vi.fn((_text: string, onEnded: () => void) => {
    lastOnEnded = onEnded
    return narrationControls
  }),
}))

import { dispatch } from '@/lib/commands/dispatch'
import { narrate } from '@/components/editor/training/narrator'
import { FirstPoolTraining } from '@/components/editor/training/FirstPoolTraining'
import { FIRST_POOL_SCRIPT } from '@/modules/editor/training/first-pool-script'

const dispatchMock = vi.mocked(dispatch)
const narrateMock = vi.mocked(narrate)

const ANNOUNCE_MIN = 2200

// Commands the runner issues for narration highlighting, view setup, and
// reframing — not for building the pool. buildCommands() strips them.
const NON_BUILD = new Set([
  'guide.point',
  'guide.clear',
  'canvas.fit',
  'camera.set.view',
  'view.set.tab',
])

function buildCommands(): string[] {
  return dispatchMock.mock.calls.map(c => c[0] as string).filter(id => !NON_BUILD.has(id))
}

// End the current spoken line and let the announce beat advance to its act.
async function finishAnnounce(): Promise<void> {
  await act(async () => {
    lastOnEnded?.()
  })
  await act(async () => {
    vi.advanceTimersByTime(ANNOUNCE_MIN + 100)
  })
}

// Elapse the act settle so the beat advances to the next step's announce.
async function finishAct(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(4000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  dispatchMock.mockClear()
  narrateMock.mockClear()
  narrationControls.pause.mockClear()
  narrationControls.resume.mockClear()
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

  it('holds the announce beat until the line finishes: no build fires early', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    // Step 1 narration is playing. Even a long time later — short of the safety
    // cap — nothing should have advanced, because the line has not ended.
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(buildCommands()).toEqual([])

    // Finish step 1's line -> act (narration only, no build). Finish that beat
    // -> step 2 announce. Still no build until step 2's line ends and its act.
    await finishAnnounce()
    await finishAct()
    expect(buildCommands()).toEqual([])
    await finishAnnounce()
    await finishAct()
    expect(buildCommands()).toEqual(['add.shape'])
  })

  it('pauses the narration and freezes, then resumes', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    await finishAnnounce()
    await finishAct() // step 2 announce
    await finishAnnounce()
    await finishAct() // step 2 built the pool
    expect(buildCommands()).toEqual(['add.shape'])

    act(() => {
      screen.getByTitle('Pause').click()
    })
    expect(narrationControls.pause).toHaveBeenCalled()
    const before = buildCommands().length
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    // Even ending the line while paused must not advance.
    act(() => {
      lastOnEnded?.()
    })
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    expect(buildCommands().length).toBe(before)

    act(() => {
      screen.getByTitle('Resume').click()
    })
    expect(narrationControls.resume).toHaveBeenCalled()
    await finishAnnounce()
    await finishAct()
    expect(buildCommands().length).toBeGreaterThan(before)
  })

  it('Next stops the current line and advances', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    act(() => {
      screen.getByTitle('Next').click()
    }) // step 1 announce -> act
    expect(narrationControls.stop).toHaveBeenCalled()
    act(() => {
      screen.getByTitle('Next').click()
    }) // step 1 act -> step 2 announce
    act(() => {
      screen.getByTitle('Next').click()
    }) // step 2 announce -> act
    await act(async () => {
      vi.advanceTimersByTime(4000)
    }) // step 2 act fires the build
    expect(buildCommands()).toEqual(['add.shape'])
  })

  it('clears the highlight and stops narration when the training unmounts', () => {
    const { unmount } = render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    dispatchMock.mockClear()
    unmount()
    const cleared = dispatchMock.mock.calls.some(c => c[0] === 'guide.clear')
    expect(cleared).toBe(true)
    expect(narrationControls.stop).toHaveBeenCalled()
  })

  it('runs every build step by the end and shows the finish panel', async () => {
    render(<FirstPoolTraining />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    for (let i = 0; i < FIRST_POOL_SCRIPT.length; i++) {
      await finishAnnounce()
      await finishAct()
    }
    const expected = FIRST_POOL_SCRIPT.filter(s => {
      const a = s.run?.({ poolId: 'shape_pool_1' })
      return a && !NON_BUILD.has(a.command)
    }).length
    expect(buildCommands().length).toBe(expected)
    expect(screen.getByText(/complete pool/i)).toBeTruthy()
  })
})
