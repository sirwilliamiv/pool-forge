// The /api/commands request contract.
//
// This exists because `z.nativeEnum(CommandSource)` — importing the Prisma enum
// straight into the route — threw `Cannot convert undefined or null to object`
// in the server runtime, so every command returned 500. Not just the auditing:
// every one. Nothing in the suite noticed, because nothing here parsed a real
// request body.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  COMMAND_SOURCES,
  DEFAULT_COMMAND_SOURCE,
  isCommandSource,
} from '@/modules/commands/source'

/** The shape the route parses. Kept in step by importing the same tuple. */
const requestSchema = z.object({
  id: z.string().min(1),
  input: z.unknown(),
  source: z.enum(COMMAND_SOURCES).optional(),
})

describe('command request contract', () => {
  it('parses a body with no source', () => {
    // Every existing caller sends exactly this. Building the schema must not
    // throw, and an absent source must not be an error.
    const parsed = requestSchema.safeParse({ id: 'add.shape', input: { x: 0 } })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.source).toBeUndefined()
  })

  it('parses every source it claims to accept', () => {
    for (const source of COMMAND_SOURCES) {
      expect(requestSchema.safeParse({ id: 'x', input: {}, source }).success).toBe(true)
    }
  })

  it('rejects a source it does not know', () => {
    expect(requestSchema.safeParse({ id: 'x', input: {}, source: 'TELEPATHY' }).success).toBe(false)
  })

  it('has a default that is one of the accepted values', () => {
    expect(isCommandSource(DEFAULT_COMMAND_SOURCE)).toBe(true)
  })

  it('matches the database enum exactly', async () => {
    // The tuple and the Prisma enum are two declarations of one set. If they
    // drift, a source the route accepts is one the write rejects.
    const { CommandSource } = await import('@prisma/client')
    expect([...COMMAND_SOURCES].sort()).toEqual(Object.values(CommandSource).sort())
  })
})
