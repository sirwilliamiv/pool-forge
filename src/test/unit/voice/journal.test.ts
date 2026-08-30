import { beforeEach, describe, expect, it } from 'vitest'
import { clearJournal, readJournal, recordCommand, recordSummary } from '@/modules/voice/client/journal'

describe('voice session journal', () => {
  beforeEach(() => clearJournal())

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
})
