// Caps and status vocabularies for the public customer-intake funnel.
//
// The hard byte and count ceilings are re-exported from the ingest seam rather
// than restated. Per `ingest/types.ts` the public route may lower a cap but
// never raise one, so anything defined here is a floor on top of those.

import {
  ALLOWED_MIME_TYPES,
  MAX_IMAGES_PER_SESSION,
  MAX_IMAGE_BYTES,
} from '@/modules/imports/ingest/types'

export { ALLOWED_MIME_TYPES, MAX_IMAGES_PER_SESSION, MAX_IMAGE_BYTES }

/**
 * Ceiling on the whole multipart body. Enforced from `Content-Length` before a
 * single byte is buffered, then again while the stream is read, so neither a
 * missing header nor a lying one can push an unbounded payload into memory.
 * The slack covers the multipart framing plus the small text fields.
 */
export const INTAKE_FIELD_SLACK_BYTES = 64 * 1024
export const INTAKE_MAX_BODY_BYTES =
  MAX_IMAGES_PER_SESSION * MAX_IMAGE_BYTES + INTAKE_FIELD_SLACK_BYTES

/** Length caps on the free-text fields. Trimmed, then truncated, never rejected. */
export const INTAKE_MAX_NAME_CHARS = 120
export const INTAKE_MAX_EMAIL_CHARS = 254
export const INTAKE_MAX_PHONE_CHARS = 40
export const INTAKE_MAX_NOTES_CHARS = 4000

/** Multipart field names the public form posts. */
export const INTAKE_FILE_FIELD = 'images'

/**
 * Rate-limit ceilings, per fixed window. Two independent buckets: one keyed on
 * the caller's network prefix, one on the intake token. The token bucket stops
 * a single leaked link from being used as an upload firehose even from a
 * botnet; the IP bucket stops one caller from walking every link an org owns.
 */
export const INTAKE_RATE_WINDOW_MS = 60 * 60 * 1000
export const INTAKE_RATE_LIMIT_PER_IP = 20
export const INTAKE_RATE_LIMIT_PER_TOKEN = 60

/** How long a spent counter row is kept before it is eligible for sweeping. */
export const INTAKE_RATE_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * Queue state for customer-intake analysis, stored on `ImportSession.analysisStatus`.
 * Declared as a const map rather than bare string literals so every reader and
 * writer shares one vocabulary (repo rule: domain statuses get a const map the
 * moment they are referenced across files).
 */
export const INTAKE_ANALYSIS_STATUS = {
  /** Not a customer-intake session, or nothing to analyze. */
  NONE: 'NONE',
  /** Persisted before any model call is attempted. Claimable. */
  PENDING: 'PENDING',
  /** Claimed by a worker. A blocking model call is in flight. */
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const

export type IntakeAnalysisStatus =
  (typeof INTAKE_ANALYSIS_STATUS)[keyof typeof INTAKE_ANALYSIS_STATUS]

const ANALYSIS_STATUS_VALUES: readonly string[] = Object.values(INTAKE_ANALYSIS_STATUS)

export function isIntakeAnalysisStatus(value: string): value is IntakeAnalysisStatus {
  return ANALYSIS_STATUS_VALUES.includes(value)
}

/**
 * A claim that has sat in RUNNING longer than this is treated as abandoned:
 * the process holding it died mid-call. Re-claimable.
 */
export const INTAKE_ANALYSIS_CLAIM_TTL_MS = 10 * 60 * 1000

/** Bytes of entropy in a minted intake token. Matches the share-link idiom. */
export const INTAKE_TOKEN_BYTES = 24

export const INTAKE_MAX_LABEL_CHARS = 80
