// Next.js instrumentation hooks.
//
// `onRequestError` is the framework's own server-error seam, added in Next 15.
// It fires for every uncaught error in a server component, a route handler, a
// server action and middleware, which is precisely the "builder hits a 500
// standing in somebody's back garden" case. Nothing has to be wrapped by hand,
// so no future route can forget to opt in.
//
// It also supplies the correlation that was missing. Next computes a `digest`
// for a server error, hands the same digest to the browser error boundary, and
// passes it here. The server record and the browser's report therefore carry
// the same digest, so `grep <digest>` returns both halves of one incident.
//
// This file must not import anything heavy: it is loaded before the app.

import type { Instrumentation } from 'next'

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { monitoringConfig } = await import('@/modules/monitoring/config')
  const config = monitoringConfig()
  // One line at boot, so "is monitoring on?" is answerable from the logs
  // rather than from someone's memory of the deploy. The URL is never printed.
  console.log(
    JSON.stringify({
      scope: 'monitoring',
      event: 'ready',
      sink: 'stdout',
      alerts: config.alertWebhookUrl === null ? 'disabled' : 'webhook',
      environment: config.environment,
      release: config.release,
    }),
  )
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // The edge runtime gets no capture: the shared scrubber reaches `node:crypto`
  // and this app runs its server work on Node. Silently skipping is better
  // than a monitoring import crashing an edge request.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { captureError } = await import('@/modules/monitoring/report')
  // `routeType` is one of render/route/action/middleware and cannot carry
  // customer data, so it is safe as the bucket. The request headers, cookies
  // and body deliberately appear nowhere in this record.
  captureError({
    error,
    code: `server_${String(context.routeType ?? 'request')}`.toLowerCase(),
    origin: 'server',
    route: request.path,
    digest: (error as { digest?: unknown } | null)?.digest,
  })
}
