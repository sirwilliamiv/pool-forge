// Everything the studio's endpoint does, minus HTTP.
//
// The route is a thin shell over this, matching `waitlist/handler.ts` and
// `imports/intake`: what is worth testing about a public endpoint is its
// behaviour, and a test that has to build a `Request` to check a rate-limit
// decision ends up testing Next.

import { DREAM_LEAD_MESSAGES, safeDreamFailure } from './errors'
import { consumeDreamLeadAttempt } from './rate-limit'
import { recordDreamLead } from './record'
import { dreamLeadSchema } from './schema'

export type DreamLeadOutcome =
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
export async function handleDreamLead(
  payload: unknown,
  ipBucket: string,
  now: Date = new Date(),
): Promise<DreamLeadOutcome> {
  try {
    const gate = await consumeDreamLeadAttempt(ipBucket, now)
    if (!gate.allowed) {
      return {
        ok: false,
        status: 429,
        error: DREAM_LEAD_MESSAGES.throttled,
        retryAfterSeconds: gate.retryAfterSeconds,
      }
    }
  } catch (err) {
    // Fail closed, as the waitlist does. A ceiling that cannot be written is a
    // ceiling that is not being enforced, and an unenforced ceiling on a public
    // write endpoint is worse than a form that is briefly unavailable.
    return { ok: false, status: 503, error: safeDreamFailure(err, 'gate').message }
  }

  const parsed = dreamLeadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, status: 400, error: DREAM_LEAD_MESSAGES.invalid }

  if (honeypotTripped(payload)) return { ok: true, status: 200 }

  try {
    await recordDreamLead(parsed.data, now)
  } catch (err) {
    return { ok: false, status: 503, error: safeDreamFailure(err, 'record').message }
  }

  return { ok: true, status: 200 }
}
