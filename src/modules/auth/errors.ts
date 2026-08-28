// What a person is told when authentication refuses them.
//
// Two constraints, and they pull against each other:
//
//   1. Nothing here may reveal whether an email address has an account. Not the
//      wording, not the presence of a throttle, not the shape of the failure. So
//      a wrong password and an unknown address produce the byte-identical
//      string, and the throttle message is the same whether the account exists,
//      never existed, or exists and is being attacked by somebody else.
//   2. Nothing here may state the ceiling or the exact time remaining. "3
//      attempts left" and "retry in 412 seconds" are both free calibration for
//      whoever is tuning a guessing run: they turn a limiter that has to be
//      probed into one that announces itself.
//
// What is left has to still be usable by a builder who mistyped their password
// on a job site, which is why the throttle copy names a rough wait and tells
// them the account itself is fine.
//
// No raw cause ever reaches these strings. A Prisma message, a bcrypt message,
// or a connection string in a stack is a server-side detail; unexpected faults
// are logged scrubbed against an `err_<12 hex>` ref and the caller gets the
// generic line plus that ref, which is the only thing support needs to find it.

import { newErrorRef, scrubErrorText } from '@/modules/imports/vision/errors'

/**
 * `code` carried by the `CredentialsSignin` subclass that `authorize` throws when
 * a ceiling refuses an attempt. Shared so the sign-in form can recognise it
 * without string-matching a message.
 */
export const LOGIN_RATE_LIMITED_CODE = 'rate_limited'

export const AUTH_MESSAGES = {
  /** Wrong password, unknown address, malformed input: one string for all three. */
  invalidCredentials: 'Invalid email or password',
  /**
   * Deliberately says nothing about which of the three ceilings was hit, and
   * nothing about the account. "Your details are fine" is safe to say because it
   * is said to everyone, including a stranger guessing at an address that has no
   * account at all.
   */
  loginThrottled:
    'Too many sign-in attempts. Please wait a few minutes and try again. If these are your details, nothing is wrong with your account.',
  registerThrottled:
    'Too many sign-up attempts from this connection. Please wait a while and try again.',
  signInUnavailable: 'Could not sign in. Please try again.',
  registerUnavailable: 'Could not create account. Please try again.',
} as const

export type AuthMessageKey = keyof typeof AUTH_MESSAGES

/** Structured warn-level log line. Debug level is invisible in production. */
export function logAuthWarning(event: string, fields: Record<string, unknown>): void {
  const payload: Record<string, unknown> = { scope: 'auth', event }
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = typeof value === 'string' ? scrubErrorText(value) : value
  }
  console.warn(JSON.stringify(payload))
}

export interface SafeAuthFailure {
  /** Safe to render. Never contains provider text, a stack, or an address. */
  message: string
  /** Correlation ref for the scrubbed server log line. */
  errorRef: string
}

/**
 * Log an unexpected authentication fault and return the string the UI may show.
 *
 * The email is never a field in the log line. An application log naming every
 * address that failed to sign in is a list of this product's customers.
 */
export function safeAuthFailure(
  cause: unknown,
  stage: string,
  key: AuthMessageKey = 'signInUnavailable',
): SafeAuthFailure {
  const errorRef = newErrorRef()
  logAuthWarning('auth_error', { errorRef, stage, cause: scrubErrorText(cause) })
  return { message: `${AUTH_MESSAGES[key]} (ref ${errorRef})`, errorRef }
}
