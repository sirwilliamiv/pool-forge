'use client'

// What a builder sees when something breaks.
//
// Three jobs, in order of how much they matter to somebody standing in a
// customer's garden holding a tablet:
//
//  1. Say plainly that it is not their fault and that nothing was lost.
//  2. Give them one thing to try (reload), and a way out (dashboard).
//  3. Show the reference. This is the whole point: they read
//     `err_1a2b3c4d5e6f` down the phone, support greps it, and the exact
//     record comes back with the route, the error name and the stack. The
//     format matches the refs the imports, intake and voice paths already
//     show, so there is one thing to ask for rather than four.
//
// It never renders the underlying message. That message may quote a customer
// name or a contract total, and it is meaningless to the person reading it.

import { useEffect, useState } from 'react'

import { reportClientError } from '@/modules/monitoring/client'

export interface ErrorFallbackProps {
  error: Error & { digest?: string }
  reset?: () => void
  /** `react_boundary` for a segment, `global_boundary` for the root shell. */
  code: string
  /** Rendered inside the app shell (false) or as a whole page (true). */
  standalone?: boolean
}

export function ErrorFallback({ error, reset, code, standalone = false }: ErrorFallbackProps) {
  const [errorRef, setErrorRef] = useState<string | null>(null)

  useEffect(() => {
    // Reported once per distinct error. `digest` changes when the underlying
    // error changes, so a re-render caused by anything else does not re-report.
    const handle = reportClientError({ error, code })
    setErrorRef(handle.errorRef)
  }, [error, code])

  return (
    <div
      role="alert"
      className={
        standalone
          ? 'flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center'
          : 'flex flex-col items-start gap-4 p-8'
      }
    >
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        Pool Forge hit a problem while loading this. Your saved work has not been changed.
        Reloading usually clears it.
      </p>
      <div className="flex gap-3">
        {reset ? (
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        ) : null}
        {/*
          A plain anchor, not `next/link`. This component renders after the
          React tree, and in the global case the root layout, has already
          failed; the router is exactly the thing not to rely on. A full
          document load is the recovery, not a regression.
        */}
        <a
          href="/dashboard"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Back to dashboard
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        {errorRef === null ? (
          'Preparing a reference for support...'
        ) : (
          <>
            Reference for support: <code data-testid="error-ref">{errorRef}</code>
          </>
        )}
      </p>
    </div>
  )
}
