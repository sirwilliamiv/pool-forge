// Browser half of error monitoring.
//
// Deliberately tiny and dependency-free. It imports only `./ref`, never
// `./report` or `./redact`, so no server-only code (and no `node:crypto`) is
// dragged into a client bundle. Redaction happens on the server, in
// `/api/monitoring/report`: the browser is talking to its own origin, so
// sending the raw message there is not a disclosure, and doing the redaction
// once, server-side, means there is exactly one implementation to test.
//
// The ref is minted here, before the network is touched, for the case this
// whole feature exists for: a builder standing in somebody's back garden on
// one bar of signal. The screen can show them a reference even if the report
// POST never lands, and if it does land the server adopts the same ref.

import { newMonitoringRef } from './ref'

const REPORT_ENDPOINT = '/api/monitoring/report'

export interface ClientErrorInput {
  error: unknown
  /** `react_boundary` for an error boundary, `global_boundary` for the root. */
  code: string
  componentStack?: string | undefined
}

export interface ClientErrorHandle {
  errorRef: string
}

function digestOf(error: unknown): string | undefined {
  const digest = (error as { digest?: unknown } | null | undefined)?.digest
  return typeof digest === 'string' ? digest : undefined
}

/**
 * Report a client-side error and return the ref to show the user.
 *
 * Synchronous return, asynchronous send. Never throws and never rejects: an
 * error boundary that itself fails renders nothing at all.
 */
export function reportClientError(input: ClientErrorInput): ClientErrorHandle {
  const errorRef = newMonitoringRef()
  try {
    const error = input.error
    const body = JSON.stringify({
      ref: errorRef,
      code: input.code,
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
      digest: digestOf(error),
      route: typeof window === 'undefined' ? undefined : window.location.pathname,
      componentStack: input.componentStack,
      stack: error instanceof Error ? error.stack : undefined,
    })
    if (typeof fetch === 'function') {
      void fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // The page may be navigating away as this fires.
        keepalive: true,
        cache: 'no-store',
      }).catch(() => {
        // Offline, or the server is the thing that is broken. The user still
        // has the ref on screen, and the server-side capture (if the failure
        // originated there) already logged its own record with the digest that
        // ties the two together.
      })
    }
  } catch {
    // Serialisation failed. The ref is still valid and still shown.
  }
  return { errorRef }
}
