// Customer-facing error handling for the public intake funnel.
//
// This is the one route an unauthenticated stranger can reach, so nothing that
// leaves it may describe the server: no filename echo, no storage path, no
// Prisma or sharp or Vertex message, no stack, no hint about whether a token
// ever existed. The caller gets one of the canned strings below plus an
// `err_<12 hex>` correlation ref; the server log gets the scrubbed cause keyed
// on the same ref.
//
// The scrubbing and the ref format are reused from `imports/vision/errors.ts`
// rather than reimplemented. One scrubber, one place to add a pattern to.

import { newErrorRef, scrubErrorText } from '@/modules/imports/vision/errors'

export type IntakeErrorCode =
  /** Invalid, unknown, inactive, or expired token. Deliberately one code. */
  | 'link_unavailable'
  | 'rate_limited'
  | 'too_large'
  | 'too_many'
  | 'unsupported_type'
  | 'corrupt'
  | 'empty'
  | 'invalid_request'
  | 'unavailable'

/**
 * Canned copy. Never interpolate a filename, a path, a token, or provider text
 * into any of these.
 *
 * `link_unavailable` is one message for four distinct server-side situations
 * (no such token, inactive, expired, org deleted). That is the point: a caller
 * enumerating tokens must not be able to tell a typo from a revoked link, so
 * the wording, the status code, and the response body are byte-identical in
 * every case.
 */
const USER_MESSAGES: Record<IntakeErrorCode, string> = {
  link_unavailable: 'This upload link is not available.',
  rate_limited: 'Too many uploads from this connection. Please try again later.',
  too_large: 'One of those files is too large.',
  too_many: 'Too many files. Please send fewer at a time.',
  unsupported_type: 'That file type is not supported. Photos and PDFs only.',
  corrupt: 'One of those files could not be read.',
  empty: 'Please choose at least one photo or document.',
  invalid_request: 'That upload could not be read. Please try again.',
  unavailable: 'Uploads are temporarily unavailable. Please try again.',
}

const STATUS_BY_CODE: Record<IntakeErrorCode, number> = {
  link_unavailable: 404,
  rate_limited: 429,
  too_large: 413,
  too_many: 413,
  unsupported_type: 415,
  corrupt: 400,
  empty: 400,
  invalid_request: 400,
  unavailable: 503,
}

export class IntakeError extends Error {
  readonly code: IntakeErrorCode
  readonly status: number
  /** Present only for server-side faults, so support can trace one report. */
  readonly errorRef: string | null

  constructor(code: IntakeErrorCode, errorRef: string | null = null) {
    super(USER_MESSAGES[code])
    this.name = 'IntakeError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.errorRef = errorRef
  }
}

export function intakeUserMessage(code: IntakeErrorCode): string {
  return USER_MESSAGES[code]
}

export function intakeStatusFor(code: IntakeErrorCode): number {
  return STATUS_BY_CODE[code]
}

/** Structured warn-level log line. Debug level is invisible in production. */
export function logIntakeWarning(event: string, fields: Record<string, unknown>): void {
  const payload: Record<string, unknown> = { scope: 'imports.intake', event }
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = typeof value === 'string' ? scrubErrorText(value) : value
  }
  console.warn(JSON.stringify(payload))
}

export interface IntakeErrorContext {
  stage: string
  orgId?: string | null
  submissionId?: string | null
}

/**
 * Wrap any thrown value into an `IntakeError`. Logs the scrubbed cause at warn
 * with a fresh correlation ref, then returns the safe error to throw onward.
 * An `IntakeError` passed back in is returned unchanged so refs stay stable.
 *
 * The token is never a field here. A log line naming the token would turn the
 * application log into a list of live capability URLs.
 */
export function safeIntakeError(
  cause: unknown,
  code: IntakeErrorCode,
  context: IntakeErrorContext,
): IntakeError {
  if (cause instanceof IntakeError) return cause
  const errorRef = newErrorRef()
  const fields: Record<string, unknown> = {
    errorRef,
    code,
    stage: context.stage,
    cause: scrubErrorText(cause),
  }
  if (context.orgId != null) fields.orgId = context.orgId
  if (context.submissionId != null) fields.submissionId = context.submissionId
  logIntakeWarning('intake_error', fields)
  return new IntakeError(code, errorRef)
}

export interface IntakeErrorBody {
  ok: false
  error: string
  code: IntakeErrorCode
  errorRef?: string
}

/**
 * The exact JSON shape returned for every failure. Built here so no route can
 * accidentally add a field that differentiates two refusals from each other.
 */
export function intakeErrorBody(error: IntakeError): IntakeErrorBody {
  const body: IntakeErrorBody = {
    ok: false,
    error: error.message,
    code: error.code,
  }
  if (error.errorRef !== null) body.errorRef = error.errorRef
  return body
}
