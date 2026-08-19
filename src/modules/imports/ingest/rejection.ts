// Carrying an `IngestRejection.code` through a `CommandResult`.
//
// `CommandResult` failures are a plain string, but a route has to answer 413 vs
// 415 vs 400 without guessing from prose. So the code travels as a fixed prefix
// and the route decodes it. This is a declared wire format between two files
// that both live here, not string-matching against a message someone might
// reword.

import { IngestRejection, type IngestRejectionCode } from './types'

const CODES: readonly IngestRejectionCode[] = [
  'TOO_LARGE',
  'UNSUPPORTED_TYPE',
  'CORRUPT',
  'TOO_MANY',
  'EMPTY',
]

const ENCODED = /^([A-Z_]+): ([\s\S]*)$/

export function encodeRejection(rejection: IngestRejection): string {
  return `${rejection.code}: ${rejection.message}`
}

export interface DecodedRejection {
  code: IngestRejectionCode
  message: string
}

/** Splits an encoded failure back apart, or `null` when it is an ordinary error. */
export function decodeRejection(error: string): DecodedRejection | null {
  const match = ENCODED.exec(error)
  const code = match?.[1]
  const message = match?.[2]
  if (!code || message === undefined) return null
  const known = CODES.find((c) => c === code)
  if (!known) return null
  return { code: known, message }
}

/** HTTP status for each rejection code. */
export function statusForRejection(code: IngestRejectionCode): number {
  switch (code) {
    case 'TOO_LARGE':
      return 413
    case 'UNSUPPORTED_TYPE':
      return 415
    case 'TOO_MANY':
      // The upload is well formed; the session is full. That is a conflict with
      // current state, not a malformed request.
      return 409
    case 'CORRUPT':
    case 'EMPTY':
      return 400
  }
}

export { IngestRejection }
