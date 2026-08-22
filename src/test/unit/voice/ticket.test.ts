// The pass a browser presents to the relay.
//
// A cross-origin WebSocket does not reliably carry the session cookie, and
// giving the relay a session store of its own is how the two drift until one is
// wrong. So the proof travels with the connection, and everything worth getting
// right about it is here: forgery, expiry, replay, and the fact that a relay
// running on a weak secret would accept anything while looking healthy.

import { describe, expect, it } from 'vitest'

import { mintTicket, ticketSecret, verifyTicket, TICKET_TTL_SECONDS } from '@/modules/voice/ticket'

const SECRET = 'a'.repeat(48)
const OTHER = 'b'.repeat(48)

const claims = { userId: 'u1', orgId: 'o1', sessionId: 's1' }

describe('voice tickets', () => {
  it('round-trips the claims', () => {
    const result = verifyTicket(mintTicket(claims, SECRET), SECRET)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ticket.orgId).toBe('o1')
    expect(result.ticket.sessionId).toBe('s1')
  })

  it('refuses a ticket signed with another secret', () => {
    const result = verifyTicket(mintTicket(claims, OTHER), SECRET)
    expect(result).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('refuses a tampered payload', () => {
    // Changing the org is the attack worth naming: it would hand someone another
    // company's tool surface and another company's budget.
    const token = mintTicket(claims, SECRET)
    const [payload, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...claims, orgId: 'someone-else', jti: 'x', exp: 9_999_999_999 }),
    ).toString('base64url')
    expect(verifyTicket(`${forged}.${signature}`, SECRET).ok).toBe(false)
    expect(payload).not.toBe(forged)
  })

  it('expires', () => {
    const minted = mintTicket(claims, SECRET, 1_000)
    expect(verifyTicket(minted, SECRET, undefined, 1_000 + TICKET_TTL_SECONDS - 1).ok).toBe(true)
    expect(verifyTicket(minted, SECRET, undefined, 1_000 + TICKET_TTL_SECONDS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('will not be honoured twice', () => {
    // The ticket rides in a query string, which is the least private place a
    // credential can sit, so it has to be worthless the moment it is used.
    const seen = new Set<string>()
    const token = mintTicket(claims, SECRET)
    expect(verifyTicket(token, SECRET, seen).ok).toBe(true)
    expect(verifyTicket(token, SECRET, seen)).toEqual({ ok: false, reason: 'replayed' })
  })

  it('gives every ticket its own identity', () => {
    const seen = new Set<string>()
    expect(verifyTicket(mintTicket(claims, SECRET), SECRET, seen).ok).toBe(true)
    // A second, legitimate ticket must not be caught by the replay check.
    expect(verifyTicket(mintTicket(claims, SECRET), SECRET, seen).ok).toBe(true)
  })

  it('refuses nonsense rather than throwing', () => {
    for (const junk of ['', 'no-dot', '.', 'a.b', 'x'.repeat(200)]) {
      expect(verifyTicket(junk, SECRET).ok).toBe(false)
    }
  })

  it('refuses to run without a real secret', () => {
    // A relay booted on a default would accept forged tickets and look healthy,
    // which is the worst way for this to fail.
    expect(() => ticketSecret({})).toThrow(/VOICE_TICKET_SECRET/)
    expect(() => ticketSecret({ VOICE_TICKET_SECRET: 'short' })).toThrow(/32/)
    expect(ticketSecret({ VOICE_TICKET_SECRET: SECRET })).toBe(SECRET)
  })
})
