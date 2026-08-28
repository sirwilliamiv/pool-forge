// Rate limiting for the public client-error report endpoint.
//
// This one is in-process on purpose, which is the opposite of the rule the
// intake funnel follows. The intake limiter is an atomic Postgres counter
// because it protects a resource: getting it wrong lets somebody upload N times
// the intended volume. This limiter protects nothing but log volume, and it
// guards the endpoint whose whole job is to work when the rest of the app does
// not. Making the error reporter depend on a database write means losing every
// client report during a database outage, which is the outage you most want
// reported. A per-instance ceiling of N becomes N times instances; for a beta
// running one instance that is the actual number, and for a larger deployment
// the failure mode is "more log lines than intended", not "budget exceeded".
//
// Fixed windows, one map, bounded size.

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 30
const MAX_BUCKETS = 5_000

interface Bucket {
  windowStart: number
  count: number
}

const buckets = new Map<string, Bucket>()

export function resetReportLimiter(): void {
  buckets.clear()
}

export interface ReportLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export function consumeReportBudget(bucketKey: string, now = Date.now()): ReportLimitDecision {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000))

  if (buckets.size >= MAX_BUCKETS) {
    for (const [key, bucket] of buckets) {
      if (bucket.windowStart < windowStart) buckets.delete(key)
    }
    if (buckets.size >= MAX_BUCKETS) buckets.clear()
  }

  const existing = buckets.get(bucketKey)
  if (existing === undefined || existing.windowStart !== windowStart) {
    buckets.set(bucketKey, { windowStart, count: 1 })
    return { allowed: true, retryAfterSeconds }
  }
  if (existing.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds }
  }
  existing.count += 1
  return { allowed: true, retryAfterSeconds }
}

export const REPORT_LIMIT_PER_WINDOW = MAX_PER_WINDOW
export const REPORT_LIMIT_WINDOW_MS = WINDOW_MS
