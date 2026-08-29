import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

// Proof that a browser is allowed to open a relay socket.
//
// A cross-origin WebSocket does not reliably carry the next-auth cookie, and
// re-implementing session validation inside the relay is how the two drift apart
// until one of them is wrong. So the Next app, which already knows who the user
// is, mints a short-lived signed ticket and the relay only has to check a
// signature. The relay needs no database, no session store and no Prisma client.

/** Long enough to open a socket, short enough that a leaked ticket is worthless. */
export const TICKET_TTL_SECONDS = 60

export interface TicketClaims {
  userId: string
  orgId: string
  /** The budget row this socket is spending. Claimed before the ticket is minted. */
  sessionId: string
  projectId?: string
  projectName?: string
}

export interface Ticket extends TicketClaims {
  /** Unique per ticket, so a relay can refuse one it has already honoured. */
  jti: string
  /** Unix seconds. */
  exp: number
}

export type VerifyFailure =
  | 'malformed'
  | 'bad-signature'
  | 'expired'
  /** Correctly signed and unexpired, but already used. */
  | 'replayed'

export type VerifyResult = { ok: true; ticket: Ticket } | { ok: false; reason: VerifyFailure }

/**
 * The signing secret.
 *
 * Fails loudly rather than defaulting. A relay running on a default secret would
 * accept a ticket anyone could forge, and it would look like it was working.
 */
export function ticketSecret(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  const secret = env['VOICE_TICKET_SECRET']?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('VOICE_TICKET_SECRET must be set to at least 32 characters')
  }
  return secret
}

export function mintTicket(claims: TicketClaims, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const ticket: Ticket = { ...claims, jti: randomUUID(), exp: nowSeconds + TICKET_TTL_SECONDS }
  const payload = base64url(JSON.stringify(ticket))
  return `${payload}.${sign(payload, secret)}`
}

/**
 * Check a ticket.
 *
 * `seen` is the relay's record of tickets already honoured. Kept as a parameter
 * rather than module state so the caller decides its lifetime and scope, and so
 * this stays a pure function that can be tested without one.
 */
export function verifyTicket(
  token: string,
  secret: string,
  seen?: Set<string>,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifyResult {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return { ok: false, reason: 'malformed' }

  const payload = token.slice(0, dot)
  const provided = token.slice(dot + 1)

  // Constant-time, and length-checked first: timingSafeEqual throws on a length
  // mismatch, which would itself leak the expected length through an exception.
  const expected = sign(payload, secret)
  if (provided.length !== expected.length) return { ok: false, reason: 'bad-signature' }
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return { ok: false, reason: 'bad-signature' }
  }

  let ticket: Ticket
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Ticket
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof ticket.exp !== 'number' || !ticket.userId || !ticket.orgId || !ticket.sessionId) {
    return { ok: false, reason: 'malformed' }
  }
  if (ticket.exp < nowSeconds) return { ok: false, reason: 'expired' }

  if (seen) {
    if (seen.has(ticket.jti)) return { ok: false, reason: 'replayed' }
    seen.add(ticket.jti)
  }

  return { ok: true, ticket }
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}
