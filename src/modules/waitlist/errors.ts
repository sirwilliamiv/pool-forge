// What a stranger is told at the front door, and what the server writes down.
//
// The constraint that shapes every string here: the reply must not depend on
// whether the address is already on the list. One sentence for an accepted
// submission, whether it created a row or found one from three weeks ago. See
// `signup.ts` for why that matters more than the small convenience of telling
// somebody they already signed up.
//
// No raw cause ever reaches a caller. A Prisma message can carry a connection
// string, and this endpoint is reachable by anybody, so unexpected faults are
// logged scrubbed against an `err_<12 hex>` ref and the visitor gets the
// generic line plus that ref, which is all support needs to find it.

import { newErrorRef, scrubErrorText } from '@/modules/imports/vision/errors'

export const WAITLIST_MESSAGES = {
  /** Every accepted submission, new address or not. */
  accepted: 'Thanks. You are on the list.',
  invalid: 'Enter an email address we can reach you at.',
  /** Names no ceiling and no exact wait: both are free calibration for a flooder. */
  throttled: 'That is a few too many requests from this connection. Please try again later.',
  unavailable: 'Something went wrong at our end. Please try again in a moment.',
} as const

/** Structured warn-level line. Debug level is invisible in production. */
export function logWaitlistWarning(event: string, fields: Record<string, unknown>): void {
  const payload: Record<string, unknown> = { scope: 'waitlist', event }
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = typeof value === 'string' ? scrubErrorText(value) : value
  }
  console.warn(JSON.stringify(payload))
}

export interface SafeWaitlistFailure {
  /** Safe to render. Never contains a stack, a query, or an address. */
  message: string
  errorRef: string
}

/**
 * Log an unexpected fault and return the string the page may show.
 *
 * The email address is never a field in the log line. A log naming every
 * address that hit the signup form is a list of this product's prospects.
 */
export function safeWaitlistFailure(cause: unknown, stage: string): SafeWaitlistFailure {
  const errorRef = newErrorRef()
  logWaitlistWarning('waitlist_error', { errorRef, stage, cause: scrubErrorText(cause) })
  return { message: `${WAITLIST_MESSAGES.unavailable} (ref ${errorRef})`, errorRef }
}
