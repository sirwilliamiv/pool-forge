import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearJournal,
  readJournal,
  recordCommand,
  recordSummary,
  setJournalIdentity,
} from '@/modules/voice/client/journal'

describe('voice session journal', () => {
  beforeEach(() => {
    setJournalIdentity('anon')
    clearJournal()
  })

  it('is empty at first and readable as a string', () => {
    expect(readJournal()).toBe('')
  })

  it('keeps the most recent entries, oldest dropped', () => {
    for (let index = 0; index < 30; index += 1) {
      recordCommand(`add.shape`, `placed shape ${index}`)
    }
    const journal = readJournal()
    expect(journal).toContain('placed shape 29')
    expect(journal).not.toContain('placed shape 0')
  })

  it('survives a simulated reload via sessionStorage', () => {
    recordSummary('User was pricing the Jones project.')
    // journal.ts reads storage lazily, so a fresh read sees what was written.
    expect(readJournal()).toContain('Jones')
  })

  it('is not readable under a different identity (shared-machine sign-out/sign-in)', () => {
    setJournalIdentity('org-a:user-a')
    clearJournal()
    recordSummary('Last exchange: the Henderson pool comes to $84,000.')
    expect(readJournal()).toContain('Henderson')

    // A different user signs in on the same tab. Nothing written under
    // org-a:user-a should be visible from org-b:user-b's slot.
    setJournalIdentity('org-b:user-b')
    expect(readJournal()).toBe('')

    // And switching back to the first identity still finds its own journal
    // untouched, proving the two are stored separately rather than one
    // overwriting the other.
    setJournalIdentity('org-a:user-a')
    expect(readJournal()).toContain('Henderson')

    setJournalIdentity('anon')
    clearJournal()
  })
})
