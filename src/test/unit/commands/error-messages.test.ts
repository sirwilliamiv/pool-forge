// What a failed command says to the person who clicked it.
//
// A first-run reviewer clicked "Add 2 LED lights" and the product showed them
// `invalid input: stencilId: Required; x: Required; y: Required` in a toast.
// That string is a Zod issue list: it is useful in a log and useless in front of
// a builder, and it reads like the product is broken.
//
// The detail is still kept, on the audit row and in the server log. These tests
// are about the other half: the sentence.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  humanCommandInputError,
  humanUnknownCommandError,
  technicalIssueList,
} from '@/lib/commands/errors'

const addShapeish = z.object({
  stencilId: z.string(),
  x: z.number(),
  y: z.number(),
})

function failureOf(schema: z.ZodTypeAny, input: unknown): z.ZodError {
  const parsed = schema.safeParse(input)
  if (parsed.success) throw new Error('expected this input to be refused')
  return parsed.error
}

describe('a validation failure reads as a sentence', () => {
  const error = failureOf(addShapeish, {})

  it('says which action failed, in the words the button used', () => {
    expect(humanCommandInputError('Add shape', error)).toContain('Add shape')
  })

  it('says nothing was changed, because that is the question a failure leaves', () => {
    expect(humanCommandInputError('Add shape', error)).toContain('Nothing was changed')
  })

  it('never shows the raw Zod issue list', () => {
    const message = humanCommandInputError('Add shape', error)
    // The exact text a real user was shown.
    expect(message).not.toContain('invalid input')
    expect(message).not.toContain('Required')
    expect(message).not.toContain('stencilId')
  })

  it('names the fields in words a person reads, not in camelCase', () => {
    const depths = failureOf(z.object({ depthShallow: z.number() }), {})
    expect(humanCommandInputError('Update pool depth profile', depths)).toContain('depth shallow')
  })

  it('handles a wrong type as well as a missing one', () => {
    const wrong = failureOf(addShapeish, { stencilId: 'pool.rectangle', x: 'left', y: 0 })
    const message = humanCommandInputError('Add shape', wrong)
    expect(message).toContain('Add shape')
    expect(message).not.toContain('Expected number')
  })

  it('keeps the developer detail for the log and the audit row', () => {
    // The other direction: humanising must not throw the diagnosis away, or a
    // support call has nothing to go on.
    expect(technicalIssueList(error)).toContain('stencilId')
    expect(technicalIssueList(error)).toContain('x')
  })

  it('does not put an internal command id in front of a user', () => {
    // No `add.shape`-shaped identifier anywhere in it.
    expect(humanUnknownCommandError()).not.toMatch(/[a-z]+\.[a-z]+/)
    expect(humanUnknownCommandError()).toContain('not available')
  })
})
