// Correlation refs for geographic provider failures.
//
// Nothing Google or Regrid returns in an error body is ever propagated to a
// caller: raw third-party error text can carry key fragments, request URLs
// (which here embed the key), or PII. Failures are logged server-side against
// an `err_<12 hex>` ref and callers degrade to null/[] with only the ref.

import { newMonitoringRef } from '@/modules/monitoring/ref'

/**
 * Logs the underlying detail against a fresh ref and returns the ref. The ref
 * is the only part of this that may reach a user or a caller.
 */
export function logGeoFailure(scope: string, detail: unknown): string {
  const ref = newMonitoringRef()
  console.error(`[site/geo] ${scope} failed (${ref})`, detail)
  return ref
}
