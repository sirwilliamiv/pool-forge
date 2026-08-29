import { captureError } from '@/modules/monitoring'

// Sending an email, or honestly failing to.
//
// There is no email account yet, and waiting for one would block invites, which
// are the whole point of an invite-only beta. So there are two transports and
// the caller does not care which is in play:
//
//   - configured: hand it to the provider.
//   - not configured: record that it would have been sent, and tell the caller
//     it was not, so the screen can offer a link to copy instead.
//
// The thing this must never do is pretend. A silent no-op transport is how an
// invite gets "sent" to somebody who never receives it, and the person who sent
// it finds out a week later when they ask why nobody signed in.

export interface Email {
  to: string
  subject: string
  /** Plain text. Every one of these is short and transactional. */
  body: string
}

export type SendResult =
  | { delivered: true; provider: string }
  | { delivered: false; reason: 'not-configured' | 'failed'; ref?: string }

/** Where a link in an email should point. */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3001').replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function emailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
}

/**
 * Send, or say plainly that nothing was sent.
 *
 * Never throws. A failure to deliver an invite must not roll back the invite
 * itself: the token is valid, the link works, and somebody can paste it into a
 * message by hand. Losing the invite because the mail provider had a bad minute
 * would be the worse outcome.
 */
export async function sendEmail(email: Email): Promise<SendResult> {
  if (!emailConfigured()) {
    // Deliberately the address and the subject, never the body: a reset link in
    // a log file is a live credential sitting in whatever collects the logs.
    console.info(
      JSON.stringify({
        scope: 'email',
        event: 'not_sent',
        reason: 'no provider configured',
        to: maskAddress(email.to),
        subject: email.subject,
      }),
    )
    return { delivered: false, reason: 'not-configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim() ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim(),
        to: [email.to],
        subject: email.subject,
        text: email.body,
      }),
    })

    if (!response.ok) {
      // The provider's own words can carry key fragments and address lists, so
      // they go to the error recorder scrubbed and never to the caller.
      const report = captureError({
        error: new Error(`email provider returned ${response.status}`),
        code: 'email.provider_rejected',
        origin: 'server',
      })
      return { delivered: false, reason: 'failed', ref: report.errorRef }
    }

    return { delivered: true, provider: 'resend' }
  } catch (cause) {
    const report = captureError({ error: cause, code: 'email.send_failed', origin: 'server' })
    return { delivered: false, reason: 'failed', ref: report.errorRef }
  }
}

/** Enough of an address to recognise, not enough to harvest. */
export function maskAddress(address: string): string {
  const [user = '', domain = ''] = address.split('@')
  const head = user.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`
}
