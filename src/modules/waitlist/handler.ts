// Everything the public signup endpoint does, minus HTTP.
//
// The route is a thin shell over this, matching `imports/intake`: what is worth
// testing about a public endpoint is its behaviour, and a test that has to
// build a `Request` to check a rate-limit decision ends up testing Next.

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

  try {
    await recordWaitlistSignup(parsed.data, now)
  } catch (err) {
    return { ok: false, status: 503, error: safeWaitlistFailure(err, 'record').message }
  }

  return { ok: true, status: 200 }
}
