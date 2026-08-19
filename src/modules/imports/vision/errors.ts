// Safe error handling for every Vertex AI call.
//
// Raw third-party error text can carry key fragments, OAuth tokens, request
// bodies, and customer PII. It never reaches a caller, a UI string, or a log
// line. Callers get a generic message plus a correlation ref of the form
// `err_<12 hex chars>`; the server log gets a scrubbed version keyed on the
// same ref.

import { randomBytes } from 'node:crypto'

/** Stable, greppable prefix for correlation refs. */
const ERROR_REF_PREFIX = 'err_'
const ERROR_REF_HEX_CHARS = 12

export type VisionErrorCode =
  | 'config'
  | 'transport'
  | 'timeout'
  | 'rate_limited'
  | 'model_refused'
  | 'invalid_response'
  | 'schema_validation'
  | 'unsupported'

/** Generic, customer-safe copy. Never interpolate provider text into these. */
const USER_MESSAGES: Record<VisionErrorCode, string> = {
  config: 'Image analysis is not configured on this server.',
  transport: 'Image analysis is temporarily unavailable. Please try again.',
  timeout: 'Image analysis took too long. Please try again.',
  rate_limited: 'Image analysis is busy right now. Please try again in a moment.',
  model_refused: 'This image could not be analyzed.',
  invalid_response: 'Image analysis returned an unreadable result.',
  schema_validation: 'Image analysis returned an unreadable result.',
  unsupported: 'This image type cannot be analyzed yet.',
}

/**
 * The only error type this module throws outward. `message` is always one of
 * the canned strings above, so it is safe to render in a UI.
 */
export class VisionError extends Error {
  readonly code: VisionErrorCode
  readonly errorRef: string

  constructor(code: VisionErrorCode, errorRef: string) {
    super(USER_MESSAGES[code])
    this.name = 'VisionError'
    this.code = code
    this.errorRef = errorRef
  }
}

export function newErrorRef(): string {
  const hex = randomBytes(ERROR_REF_HEX_CHARS).toString('hex').slice(0, ERROR_REF_HEX_CHARS)
  return ERROR_REF_PREFIX + hex
}

const ERROR_REF_PATTERN = /^err_[0-9a-f]{12}$/

export function isErrorRef(value: string): boolean {
  return ERROR_REF_PATTERN.test(value)
}

/** Patterns that have leaked credentials or PII out of Google API error text. */
const SCRUB_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: '[redacted-key]' },
  { pattern: /\bya29\.[A-Za-z0-9._-]+/g, replacement: '[redacted-token]' },
  { pattern: /\bAIza[A-Za-z0-9_-]{10,}/g, replacement: '[redacted-key]' },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '[redacted-jwt]' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, replacement: 'Bearer [redacted]' },
  { pattern: /\bhttps?:\/\/\S*[?&](?:key|access_token|token)=\S+/gi, replacement: '[redacted-url]' },
  { pattern: /"data"\s*:\s*"[A-Za-z0-9+/=]{40,}"/g, replacement: '"data":"[redacted-inline-data]"' },
  { pattern: /\b(key|token|secret|password|authorization|api[_-]?key)\s*[=:]\s*"?[^\s",}]+/gi, replacement: '$1=[redacted]' },
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[redacted-email]' },
  { pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, replacement: '[redacted-ip]' },
]

/** Hard ceiling so a megabyte of echoed request body never reaches a log. */
const MAX_SCRUBBED_LENGTH = 600

/**
 * Reduce arbitrary third-party error text to something safe to log. Applied to
 * every provider error before it is written anywhere.
 */
export function scrubErrorText(input: unknown): string {
  let text: string
  if (typeof input === 'string') {
    text = input
  } else if (input instanceof Error) {
    text = `${input.name}: ${input.message}`
  } else {
    try {
      text = JSON.stringify(input) ?? '[unserializable]'
    } catch {
      text = '[unserializable]'
    }
  }
  // Truncate before scrubbing, not after. The patterns below are linear on a
  // bounded input and quadratic on an unbounded one, and an error carrying a
  // megabyte of echoed request body is exactly the case that would stall the
  // log path. Anything past the cap is dropped rather than redacted, which is
  // the safer of the two outcomes anyway.
  const overLength = text.length > MAX_SCRUBBED_LENGTH
  let scrubbed = overLength ? text.slice(0, MAX_SCRUBBED_LENGTH) : text
  for (const entry of SCRUB_PATTERNS) {
    scrubbed = scrubbed.replace(entry.pattern, entry.replacement)
  }
  if (overLength) scrubbed = `${scrubbed}...[truncated]`
  return scrubbed
}

/**
 * Structured warn-level log line. Every validation drop and every provider
 * failure goes through here: at debug level these are invisible in production
 * and the feature degrades silently.
 */
export function logVisionWarning(event: string, fields: Record<string, unknown>): void {
  const payload: Record<string, unknown> = { scope: 'imports.vision', event }
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = typeof value === 'string' ? scrubErrorText(value) : value
  }
  console.warn(JSON.stringify(payload))
}

export interface SafeErrorContext {
  stage: string
  model?: string | null
  sourceImageId?: string | null
  attempt?: number | null
}

/**
 * Wrap any thrown value into a `VisionError`. Logs the scrubbed cause at warn
 * with the correlation ref, then returns the safe error for the caller to
 * throw. A `VisionError` passed back in is returned unchanged so refs stay
 * stable across re-wraps.
 */
export function safeVisionError(
  cause: unknown,
  code: VisionErrorCode,
  context: SafeErrorContext,
): VisionError {
  if (cause instanceof VisionError) return cause
  const errorRef = newErrorRef()
  const fields: Record<string, unknown> = {
    errorRef,
    code,
    stage: context.stage,
    cause: scrubErrorText(cause),
  }
  if (context.model != null) fields.model = context.model
  if (context.sourceImageId != null) fields.sourceImageId = context.sourceImageId
  if (context.attempt != null) fields.attempt = context.attempt
  logVisionWarning('vision_error', fields)
  return new VisionError(code, errorRef)
}

/** The canned copy for a code, for callers that render without an exception. */
export function userMessageFor(code: VisionErrorCode): string {
  return USER_MESSAGES[code]
}
