// Server-side barrel. Client components must import `@/modules/monitoring/ref`
// or `@/modules/monitoring/client` directly: everything re-exported here
// reaches `node:crypto` through the shared credential scrubber and has no
// business in a browser bundle.

export { captureError, buildReport, fingerprintOf } from './report'
export type { CaptureInput, ErrorReport, ErrorOrigin, ErrorSeverity } from './report'
export { monitoringConfig, alertingEnabled } from './config'
export type { MonitoringConfig } from './config'
export { maskRoute, redactErrorName, redactStack, redactText } from './redact'
export { adoptRef, isMonitoringRef, newMonitoringRef, MONITORING_REF_PATTERN } from './ref'
export { buildAlertPayload, resetAlertDedupe, sendAlert, shouldAlert } from './alert'
export type { AlertPayload } from './alert'
