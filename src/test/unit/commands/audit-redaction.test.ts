// @vitest-environment node
//
// `CommandAuditLog.inputJson` is kept forever. That is what makes it the answer
// to "what did the user actually do", and it is exactly why the two commands
// that are handed a live credential must not be audited raw.
//
// Two of them exist: accepting an invite and completing a password reset. Both
// take a one-time link and a password somebody is choosing. A password in a log
// table is a password that has leaked to anything with SELECT on that table, and
// a one-time link in a log table is an account.
//
// No database and no network here: `auditableInput` is the pure function that
// stands between the command and the write, so it is what this checks, together
// with the fact that the two commands actually declare it.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { auditableInput } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import { get, type EditorCommand } from '@/modules/commands/registry'

initCommands()

const CREDENTIAL_COMMANDS = ['team.invite.accept', 'auth.password.reset'] as const

const SECRET = 'a-password-nobody-should-ever-read'
const LINK = 'DkK1sYVsQhTJ3v0hV2xkX6nHnPqBQ4mM1jHqRr9lF2c'

function command(id: string): EditorCommand<unknown, unknown> {
  const found = get(id)
  if (!found) throw new Error(`command ${id} is not registered`)
  return found
}

describe('the commands that handle credentials', () => {
  it.each(CREDENTIAL_COMMANDS)('%s declares a redaction', (id) => {
    // Guards the guard. Without this, every assertion below would pass
    // vacuously the day somebody removed `redactForAudit` from a command.
    expect(command(id).redactForAudit, `${id} must redact its input`).toBeTypeOf('function')
  })

  it.each(CREDENTIAL_COMMANDS)('%s keeps no password in the audit row', (id) => {
    const audited = auditableInput(command(id), { token: LINK, password: SECRET })
    expect(JSON.stringify(audited)).not.toContain(SECRET)
    // Not a trace of it under any key either: not truncated, not hashed, not a
    // length. "The password was 8 characters" is a narrowed search space.
    const keys = Object.keys(audited as Record<string, unknown>)
    expect(keys).not.toContain('password')
    expect(Object.values(audited as Record<string, unknown>)).not.toContain(SECRET.length)
  })

  it.each(CREDENTIAL_COMMANDS)('%s keeps no usable link in the audit row', (id) => {
    const audited = auditableInput(command(id), { token: LINK, password: SECRET })
    expect(JSON.stringify(audited)).not.toContain(LINK)
    // The sha256 IS kept, deliberately: it is the value `AuthToken` stores, so
    // the row still joins to the invite it spent, and it grants nobody anything.
    expect(audited).toMatchObject({ tokenHash: createHash('sha256').update(LINK).digest('hex') })
  })

  it('redacts on the path where the input never parsed', () => {
    // The case this exists for. A password one character too short fails the
    // schema, and the audit write on that path sees the RAW body, which is the
    // one place a real person's real password is guaranteed to be present.
    const audited = auditableInput(command('team.invite.accept'), {
      token: LINK,
      password: 'short',
      unexpected: { nested: SECRET },
    })
    expect(JSON.stringify(audited)).not.toContain('short')
    expect(JSON.stringify(audited)).not.toContain(SECRET)
  })

  it('survives rubbish rather than letting the secret through', () => {
    expect(auditableInput(command('auth.password.reset'), null)).toEqual({ tokenHash: null })
    expect(auditableInput(command('auth.password.reset'), 'not an object')).toEqual({
      tokenHash: null,
    })
  })
})

describe('a redactor that throws', () => {
  it('does not become the reason a secret is logged', () => {
    const exploding = {
      ...command('auth.password.reset'),
      redactForAudit: () => {
        throw new Error('boom')
      },
    } as EditorCommand<unknown, unknown>
    expect(auditableInput(exploding, { password: SECRET })).toEqual({ redacted: true })
  })
})

describe('every other command', () => {
  it('is audited exactly as before', () => {
    const plain = get('settings.company.update')
    expect(plain?.redactForAudit).toBeUndefined()
    const input = { name: 'Blue Water Pools', taxRatePct: 7 }
    expect(auditableInput(plain, input)).toBe(input)
  })
})

describe('the team commands', () => {
  it.each([
    'team.invite',
    'team.invite.revoke',
    'team.member.setRole',
    'team.member.remove',
    'team.member.resetPassword',
    'team.invite.accept',
    'auth.password.reset',
  ])('registers %s', (id) => {
    expect(command(id).category).toBe('auth')
  })

  it('offers none of them to the voice agent', () => {
    // "Make Sam an owner" is a sentence a model can mishear into handing
    // somebody the keys to a business, and there is no undo on a stranger
    // reading your price book. A command with no examples is left out of the
    // spoken surface entirely.
    for (const id of [
      'team.invite',
      'team.member.setRole',
      'team.member.remove',
      'team.member.resetPassword',
      'team.invite.accept',
      'auth.password.reset',
    ]) {
      expect(command(id).voiceExamples ?? []).toHaveLength(0)
    }
  })
})
