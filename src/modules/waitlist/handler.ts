// Everything the public signup endpoint does, minus HTTP.
//
// The route is a thin shell over this, matching `imports/intake`: what is worth
// testing about a public endpoint is its behaviour, and a test that has to
// build a `Request` to check a rate-limit decision ends up testing Next.

import { sendEmail } from '@/modules/email/send'
import { captureError } from '@/modules/monitoring'

import {
  buildOperatorNotifyEmail,
  buildThankYouEmail,
  getOperatorEmails,
} from './emails'
import { safeWaitlistFailure, WAITLIST_MESSAGES } from './errors'
import { consumeWaitlistAttempt } from './rate-limit'
import { waitlistSignupSchema } from './schema'
import { recordWaitlistSignup } from './signup'

export type WaitlistOutcome =
  | { ok: true; status: 200 }
  | { ok: false; status: 400 | 503; error: string }
  | { ok: false; status: 429; error: string; retryAfterSeconds: number }

/**
 * The field no person can see and no person fills in.
 *
 * Cheap, and it costs a legitimate submission nothing. A bot that fills it gets
 * the same 200 and the same sentence as everybody else: telling it that it was
 * caught is telling it how not to be caught next time.
 */
const HONEYPOT_FIELD = 'website'

function honeypotTripped(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const value = (payload as Record<string, unknown>)[HONEYPOT_FIELD]
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Send confirmation and notification emails after a successful signup.
 *
 * Only called when a *new* row was created, not on duplicate submissions. This
 * prevents spamming a person who re-submits and avoids leaking (via email
 * arrival timing) whether an address was already on the list.
 *
 * Failures here are logged but do not affect the signup outcome: a failed email
 * must not roll back a valid row, and the submitter must not see a different
 * response depending on email success.
 */
async function sendWaitlistEmails(
  input: {
    email: string
    name?: string | undefined
    company?: string | undefined
    phone?: string | undefined
    teamSize?: string | undefined
    usesToday?: string | undefined
    note?: string | undefined
    source?: string | undefined
  },
): Promise<void> {
  try {
    const thankYouEmail = buildThankYouEmail(input)
    await sendEmail(thankYouEmail)
  } catch (err) {
    captureError({
      error: err,
      code: 'waitlist.thank_you_email_failed',
      origin: 'server',
    })
  }

  const operators = getOperatorEmails()
  for (const operatorEmail of operators) {
    try {
      const notifyEmail = buildOperatorNotifyEmail(operatorEmail, {
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        teamSize: input.teamSize,
        usesToday: input.usesToday,
        note: input.note,
        source: input.source,
      })
      await sendEmail(notifyEmail)
    } catch (err) {
      captureError({
        error: err,
        code: 'waitlist.operator_notify_failed',
        origin: 'server',
      })
    }
  }
}

/**
 * Validate, throttle, and record one submission.
 *
 * Ordered so the address pays for the attempt before anything else happens.
 * Validating first would hand out unlimited free tries at shaping a payload,
 * and this ceiling is the only thing between a public endpoint and a table
 * filled from outside.
 */
export async function handleWaitlistSubmission(
  payload: unknown,
  ipBucket: string,
  now: Date = new Date(),
): Promise<WaitlistOutcome> {
  try {
    const gate = await consumeWaitlistAttempt(ipBucket, now)
    if (!gate.allowed) {
      return {
        ok: false,
        status: 429,
        error: WAITLIST_MESSAGES.throttled,
        retryAfterSeconds: gate.retryAfterSeconds,
      }
    }
  } catch (err) {
    // Fail closed, as registration does. A ceiling that cannot be written is a
    // ceiling that is not being enforced, and an unenforced ceiling on the one
    // endpoint a stranger writes rows through is worse than a form that is
    // briefly unavailable.
    return { ok: false, status: 503, error: safeWaitlistFailure(err, 'gate').message }
  }

  const parsed = waitlistSignupSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, status: 400, error: WAITLIST_MESSAGES.invalid }

  if (honeypotTripped(payload)) return { ok: true, status: 200 }

  let isNewSignup = false
  try {
    const result = await recordWaitlistSignup(parsed.data, now)
    isNewSignup = result.isNew
  } catch (err) {
    return { ok: false, status: 503, error: safeWaitlistFailure(err, 'record').message }
  }

  // Send emails only for new signups, never for duplicate submissions. This
  // avoids spamming someone who re-submits and prevents timing-based leaks
  // about whether an address was already on the list. Failures do not affect
  // the success response.
  if (isNewSignup) {
    // Fire and forget: don't await in a way that delays the response or makes
    // it differ based on email success.
    sendWaitlistEmails(parsed.data).catch(() => {
      // Already captured inside sendWaitlistEmails; nothing more to do.
    })
  }

  return { ok: true, status: 200 }
}
