// The rate-limit bucket key for an authentication request.
//
// The two ways to get this wrong are already solved, tested, and commented at
// length in `@/modules/imports/intake/client-ip`:
//
//   1. Trusting the whole `X-Forwarded-For` chain. Every entry except the last
//      was written by the caller, so only the trailing hop our own proxy
//      appended is evidence of anything.
//   2. Keying IPv6 at /128. One residential allocation is a /64 or shorter, so
//      a single machine can mint 2^64 addresses and get a fresh bucket for
//      every guess. Folding to the /64 prefix puts the allocation in one
//      bucket.
//
// Those primitives are pure, I/O free, and already property-covered, so this
// module imports them rather than growing a second copy that can drift out of
// agreement with the first. What it does not inherit is the header *policy*:
// intake reads an operator-named fallback header out of `INTAKE_TRUSTED_IP_HEADER`,
// and a variable named for the customer-upload funnel has no business deciding
// who gets locked out of the sign-in page. Auth names its own.

import {
  UNKNOWN_IP_BUCKET,
  normalizeIpBucket,
  trustedForwardedHop,
  type HeaderSource,
} from '@/modules/imports/intake/client-ip'

export { UNKNOWN_IP_BUCKET }

const XFF_HEADER = 'x-forwarded-for'

/**
 * Optional single fallback header, named by `AUTH_TRUSTED_IP_HEADER`, consulted
 * only when `X-Forwarded-For` is absent.
 *
 * Unset by default and deliberately not a guess-list of provider headers.
 * `cf-connecting-ip` and friends are trustworthy behind that one provider and
 * are plain client-settable text everywhere else, so probing for them would let
 * any caller mint a fresh bucket per request by varying a header. Naming the
 * header is an operator statement about the deployment, which is the only thing
 * that makes it worth believing.
 */
const TRUSTED_HEADER_ENV = 'AUTH_TRUSTED_IP_HEADER'

/**
 * Derive the bucket key an authentication attempt is counted under.
 *
 * Returns `UNKNOWN_IP_BUCKET` when no address can be established. That is a
 * single shared bucket, which is deliberate: an unattributable attempt still
 * has to be counted somewhere, and counting it nowhere would make "send no
 * usable address" the way around the limiter. The ceilings are chosen knowing
 * that this bucket can be crowded, which is why exhausting an IP bucket refuses
 * the window rather than locking anything.
 */
export function authClientIpBucket(
  headers: HeaderSource,
  socketAddress: string | null = null,
): string {
  const forwarded = trustedForwardedHop(headers.get(XFF_HEADER))
  if (forwarded !== null) return normalizeIpBucket(forwarded)

  const trustedHeader = process.env[TRUSTED_HEADER_ENV]?.trim().toLowerCase()
  if (trustedHeader) {
    const value = headers.get(trustedHeader)
    if (value !== null && value.trim().length > 0) return normalizeIpBucket(value)
  }

  return normalizeIpBucket(socketAddress)
}
