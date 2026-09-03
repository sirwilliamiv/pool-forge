// The one ceiling every Google Maps proxy route shares.
//
// The routes are auth-gated (session on the web, bearer on mobile), but auth
// only proves the caller is a real user, not that they are behaving: Google
// bills per call, so an authenticated loop still costs money. This spends a
// per-address budget from the same atomic Postgres counter the intake and
// waitlist routes use, so the ceiling holds across Cloud Run instances.
//
// Keyed on the caller's network prefix via the shared derivation (one trusted
// proxy hop, IPv6 folded to /64), so it cannot be sidestepped by rotating a
// spoofed forwarded header or a /128 address.

import { clientIpBucket, type HeaderSource } from '@/modules/imports/intake/client-ip'
import { consumeMapsProxyBudget } from '@/modules/imports/intake/rate-limit'

export interface MapsProxyGate {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Consume one unit of the maps-proxy budget for the caller behind `headers`.
 * Call after auth and before touching Google.
 */
export async function checkMapsProxyBudget(headers: HeaderSource): Promise<MapsProxyGate> {
  const decision = await consumeMapsProxyBudget(clientIpBucket(headers))
  return { allowed: decision.allowed, retryAfterSeconds: decision.retryAfterSeconds }
}
