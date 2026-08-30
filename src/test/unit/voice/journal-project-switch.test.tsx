import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'

import { clearJournal, readJournal, recordSummary } from '@/modules/voice/client/journal'
import { useVoiceSession } from '@/modules/voice/client/useVoiceSession'

// The journal is keyed by a single fixed sessionStorage slot, not by project.
// Left alone, ending a session on one project and starting a new one on
// another would hand the model the wrong project's actions, framed as
// "context from earlier in this session". These tests exercise the effect in
// useVoiceSession that clears the journal on an actual project switch, and
// only on an actual switch.

describe('useVoiceSession project scoping of the journal', () => {
  it('does not clear the journal on first mount, even with a project already set', () => {
    clearJournal()
    recordSummary('User was pricing the Jones project.')
    renderHook(() => useVoiceSession('editor', 'project-a'))
    // A reload lands here with a project already in the URL. Clearing on that
    // first render would defeat the whole feature: reloading would always
    // wipe the very journal that is supposed to survive it.
    expect(readJournal()).toContain('Jones')
  })

  it('keeps the journal across renders while the project stays the same', () => {
    clearJournal()
    recordSummary('User was pricing the Jones project.')
    const { rerender } = renderHook(({ projectId }: { projectId?: string }) => useVoiceSession('editor', projectId), {
      initialProps: { projectId: 'project-a' },
    })
    rerender({ projectId: 'project-a' })
    rerender({ projectId: 'project-a' })
    expect(readJournal()).toContain('Jones')
  })

  it('clears the journal on an actual project switch', () => {
    clearJournal()
    recordSummary('User was pricing the Jones project.')
    const { rerender } = renderHook(({ projectId }: { projectId?: string }) => useVoiceSession('editor', projectId), {
      initialProps: { projectId: 'project-a' },
    })
    rerender({ projectId: 'project-b' })
    expect(readJournal()).toBe('')
  })

  it('clears the journal when a project closes to no project at all', () => {
    clearJournal()
    recordSummary('User was pricing the Jones project.')
    const { rerender } = renderHook(
      ({ projectId }: { projectId: string | undefined }) => useVoiceSession('editor', projectId),
      { initialProps: { projectId: 'project-a' as string | undefined } },
    )
    rerender({ projectId: undefined })
    expect(readJournal()).toBe('')
  })
})
