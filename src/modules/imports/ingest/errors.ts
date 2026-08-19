// Correlation refs for ingest failures.
//
// Nothing a decoder, a wasm module, or a cloud SDK throws is ever propagated to
// a caller: raw third-party error text can carry key fragments, tokens, or file
// paths. Failures are logged server-side against an `err_<12 hex>` ref and the
// caller gets a generic message plus that ref.

import { randomBytes } from 'node:crypto'

export const ERROR_REF_PATTERN = /^err_[0-9a-f]{12}$/

export function newErrorRef(): string {
  return `err_${randomBytes(6).toString('hex')}`
}

/**
 * Logs the underlying detail against a fresh ref and returns the ref. The ref
 * is the only part of this that may reach a user.
 */
export function logIngestFailure(scope: string, detail: unknown): string {
  const ref = newErrorRef()
  console.error(`[imports/ingest] ${scope} failed (${ref})`, detail)
  return ref
}
