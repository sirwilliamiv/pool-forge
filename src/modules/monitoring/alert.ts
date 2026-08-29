// Optional outbound alerting.
//
// Structured stdout answers "find me that error"; it does not answer "tell me
// it happened". For a single-instance beta the cheapest honest answer to the
// second question is a webhook the owner already has: a Slack or Discord
// incoming webhook, or any endpoint that accepts a JSON POST. No vendor
// account, no SDK, no bundle cost, no source-map upload token, and nothing to
// configure for it to stay off.
//
// What crosses the wire is deliberately less than what is logged:
//
//  * The redacted record minus `stack`. Frames add nothing to a notification
//    and are the field most likely to carry a path with a name in it.
//  * A one-line `text` summary, because that is the field Slack and Discord
//    render. It is assembled from already-redacted values only.
//
// Failure of an alert is never allowed to matter. It has a short timeout, it
// swallows every error, and it is invoked without being awaited.

import type { ErrorReport } from './report'

const ALERT_TIMEOUT_MS = 3_000
const DEDUPE_WINDOW_MS = 15 * 60 * 1000
const DEDUPE_MAX_ENTRIES = 500

/**
 * Per-process dedupe. Stated plainly because it is a real limitation: N
 * instances each keep their own table, so a burst can produce up to N alerts
 * for one fingerprint. That is acceptable for a notification (the cost of
 * over-alerting is noise) and would not be acceptable for a quota or a rate
 * limit, which is why the intake limiter uses an atomic database counter
 * instead. Alerting must not need a database: the database is a thing that
 * breaks.
 */
const lastAlertedAt = new Map<string, number>()

export function resetAlertDedupe(): void {
  lastAlertedAt.clear()
}

export function shouldAlert(fingerprint: string, now = Date.now()): boolean {
  const previous = lastAlertedAt.get(fingerprint)
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false
  if (lastAlertedAt.size >= DEDUPE_MAX_ENTRIES) {
    // Cheap bound. An unbounded map on the error path is its own outage.
    for (const [key, at] of lastAlertedAt) {
      if (now - at >= DEDUPE_WINDOW_MS) lastAlertedAt.delete(key)
    }
    if (lastAlertedAt.size >= DEDUPE_MAX_ENTRIES) lastAlertedAt.clear()
  }
  lastAlertedAt.set(fingerprint, now)
  return true
}

export interface AlertPayload {
  /** Rendered by Slack and Discord incoming webhooks. Redacted values only. */
  text: string
  report: Omit<ErrorReport, 'stack'>
}

/**
 * Build what is sent. Separated from the sending so a test can assert on the
 * exact bytes that would leave the process without any network being involved.
 *
 * Every field is listed by hand rather than spread from the report. Spreading
 * is a denylist, and a denylist silently ships whatever gets added to
 * `ErrorReport` next. This is an allowlist, and because the target type is
 * `Omit<ErrorReport, 'stack'>` a new field on the record makes this function
 * fail to compile until somebody decides whether it may leave the process.
 */
export function buildAlertPayload(report: ErrorReport): AlertPayload {
  const rest: Omit<ErrorReport, 'stack'> = {
    scope: report.scope,
    event: report.event,
    errorRef: report.errorRef,
    severity: report.severity,
    origin: report.origin,
    code: report.code,
    route: report.route,
    name: report.name,
    message: report.message,
    digest: report.digest,
    fingerprint: report.fingerprint,
    orgId: report.orgId,
    userId: report.userId,
    environment: report.environment,
    release: report.release,
    at: report.at,
  }
  const where = report.route ?? 'unknown route'
  const text =
    `Pool Forge ${rest.environment}: ${rest.origin} error at ${where} ` +
    `(${rest.name}/${rest.code}) ${rest.errorRef}`
  return { text, report: rest }
}

/**
 * POST the alert. Returns a boolean rather than throwing, and is safe to call
 * without awaiting. `fetchImpl` exists so a test can prove the payload without
 * a network stub reaching into globals.
 */
export async function sendAlert(
  url: string,
  report: ErrorReport,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    if (!shouldAlert(report.fingerprint)) return false
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildAlertPayload(report)),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.warn(
        JSON.stringify({
          scope: 'monitoring',
          event: 'alert_rejected',
          status: response.status,
          errorRef: report.errorRef,
        }),
      )
      return false
    }
    return true
  } catch {
    // The sink being down is not an application error and must not become one.
    console.warn(
      JSON.stringify({
        scope: 'monitoring',
        event: 'alert_failed',
        errorRef: report.errorRef,
      }),
    )
    return false
  }
}
