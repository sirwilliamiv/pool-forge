// What a visitor is told, and what the server writes down.
//
// Same constraint as the waitlist's: the reply must not depend on whether we
// have seen this address before. Somebody could type a neighbour's address, or
// a competitor's, and "you already saved a design" would tell them something
// about that person. One sentence, whatever happened in the database.
//
// No raw cause reaches a caller. A Prisma message can carry a connection
// string, this endpoint is reachable by anybody, so faults are logged scrubbed
// against an `err_<12 hex>` ref and the visitor gets the generic line plus that
// ref.

import { newErrorRef, scrubErrorText } from '@/modules/imports/vision/errors'

export const DREAM_LEAD_MESSAGES = {
  /**
   * Every accepted submission, new address or not.
   *
   * Says only what happens. There is no mail provider yet
   * (`docs/beta-operations.md`), so nothing here may promise an email: a page
   * that says "check your inbox" and sends nothing is the first and last thing
   * a homeowner learns about this company. The link on the page is the thing
   * that genuinely works today, and the panel leads with it.
   */
  accepted: 'Saved. A builder in your area can pick this up.',
  invalid: 'Enter an email address we can reach you at.',
  /** Names no ceiling and no exact wait: both are free calibration for a flooder. */
  throttled: 'That is a few too many requests from this connection. Please try again later.',
  unavailable: 'Something went wrong at our end. Please try again in a moment.',
} as const

/** Structured warn-level line. Debug level is invisible in production. */
export function logDreamWarning(event: string, fields: Record<string, unknown>): void {
  const payload: Record<string, unknown> = { scope: 'dream', event }
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = typeof value === 'string' ? scrubErrorText(value) : value
  }
  console.warn(JSON.stringify(payload))
}

export interface SafeDreamFailure {
  /** Safe to render. Never contains a stack, a query, or an address. */
  message: string
  errorRef: string
}

/**
 * Log an unexpected fault and return the string the page may show.
 *
 * The email address is never a field in the log line, for the same reason it is
 * not one in the waitlist's: a log naming every address that used this page is
 * a list of homeowners who are about to spend six figures, which is exactly the
 * list worth stealing.
 */
export function safeDreamFailure(cause: unknown, stage: string): SafeDreamFailure {
  const errorRef = newErrorRef()
  logDreamWarning('dream_lead_error', { errorRef, stage, cause: scrubErrorText(cause) })
  return { message: `${DREAM_LEAD_MESSAGES.unavailable} (ref ${errorRef})`, errorRef }
}
