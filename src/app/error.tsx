'use client'

// Route-level error boundary. Catches anything thrown while rendering a page,
// a layout below the root, or a client component, anywhere in the app that does
// not define a closer boundary of its own.
//
// A server error reaches here with `error.digest` set by Next and the real
// message stripped, which is the framework refusing to leak server internals to
// a browser. That digest is the correlation handle: the same value appears in
// the `onRequestError` record written by `src/instrumentation.ts`, so one grep
// returns both the server-side cause and the browser-side report.

import { ErrorFallback } from '@/components/monitoring/ErrorFallback'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorFallback error={error} reset={reset} code="react_boundary" />
}
