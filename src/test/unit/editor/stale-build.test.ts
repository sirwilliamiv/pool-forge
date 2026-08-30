import { describe, expect, it } from 'vitest'

import { isStaleBuild } from '@/modules/editor/stale-build'

// A tab left open across a deploy holds a bundle whose server action ids no
// longer exist on the server. Every save then fails, permanently, for that tab,
// while the drawing keeps changing on screen. Telling that person to check
// their connection sends them to look at their wifi while their work goes
// nowhere, so the two cases have to be told apart.

describe('recognising a page older than the server', () => {
  it('recognises the error Next throws by name', () => {
    const error = new Error('whatever')
    error.name = 'UnrecognizedActionError'
    expect(isStaleBuild(error)).toBe(true)
  })

  it('recognises it by message, since the name is not always preserved', () => {
    expect(
      isStaleBuild(new Error('Server Action "60ce24" was not found on the server.')),
    ).toBe(true)
  })

  it('does not mistake a network failure for a stale build', () => {
    expect(isStaleBuild(new TypeError('Failed to fetch'))).toBe(false)
  })

  it('does not mistake a database error for a stale build', () => {
    expect(isStaleBuild(new Error('connection terminated unexpectedly'))).toBe(false)
  })

  it('survives something that is not an Error at all', () => {
    expect(isStaleBuild('was not found on the server')).toBe(true)
    expect(isStaleBuild(null)).toBe(false)
  })
})
