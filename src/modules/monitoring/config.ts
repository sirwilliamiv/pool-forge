// Monitoring configuration, read from the environment on every call.
//
// The governing constraint: **the app runs with none of this set.** No key is
// required in development, in CI, or in a beta deployment. Unconfigured is not
// a degraded mode, it is the default mode: errors are still captured, still
// redacted, and still written as structured JSON to stdout, where the host's
// log aggregation already collects them. Setting `MONITORING_ALERT_WEBHOOK_URL`
// only adds a push notification on top of that.
//
// Read per call rather than cached at import so a test can set and unset the
// variable without module-registry surgery, and so a redeploy that changes it
// takes effect without a code path that reads a stale value.

export interface MonitoringConfig {
  /** Absolute https URL of an alert sink, or null when alerting is off. */
  alertWebhookUrl: string | null
  /** Free-text deployment label, for telling beta from local in an alert. */
  environment: string
  /** Optional build identifier, usually a git sha. */
  release: string | null
}

function readUrl(): string | null {
  const raw = process.env.MONITORING_ALERT_WEBHOOK_URL?.trim()
  if (!raw) return null
  // Secret Manager values arrive with a trailing newline often enough that
  // trimming is not optional. https only: an alert travels over the internet.
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    console.warn(
      JSON.stringify({
        scope: 'monitoring',
        event: 'config_invalid',
        reason: 'MONITORING_ALERT_WEBHOOK_URL is not a URL',
      }),
    )
    return null
  }
  if (parsed.protocol !== 'https:') {
    console.warn(
      JSON.stringify({
        scope: 'monitoring',
        event: 'config_invalid',
        reason: 'MONITORING_ALERT_WEBHOOK_URL must be https',
      }),
    )
    return null
  }
  return parsed.toString()
}

export function monitoringConfig(): MonitoringConfig {
  const release = process.env.MONITORING_RELEASE?.trim()
  return {
    alertWebhookUrl: readUrl(),
    environment: process.env.MONITORING_ENV?.trim() || process.env.NODE_ENV || 'development',
    release: release && release.length > 0 ? release : null,
  }
}

/**
 * Whether outbound alerting may run at all.
 *
 * Tests never reach the network even if the variable is set in the shell the
 * suite inherited: a test suite that can post to a webhook is a test suite that
 * can page somebody at 3am.
 */
export function alertingEnabled(config: MonitoringConfig = monitoringConfig()): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false
  return config.alertWebhookUrl !== null
}
