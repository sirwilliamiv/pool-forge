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
//
// ── On the design ──────────────────────────────────────────────────────────
//
// Built to `docs/brand-bible.md`, but quiet. The bible's line on this is that
// failure is a moment for direction rather than mood: this page is not the
// place for the spectrum, so it gets one red marker and one cropped shape and
// otherwise stays black on white with a generous measure. An error screen that
// is busy reads as panic.
//
// The reference is treated as the most important thing on the page after the
// first sentence, because it is: it is the only thing here that support can
// act on. It gets the mono face, a field of its own, and a copy button, so
// nobody has to transcribe twelve hex characters by eye.
//
// `standalone` is the global boundary, which replaces the root layout and so
// cannot assume global CSS ever loaded. Everything structural there is also
// expressed inline, so a total failure still degrades to something legible
// rather than to unstyled tags.

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
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Reported once per distinct error. `digest` changes when the underlying
    // error changes, so a re-render caused by anything else does not re-report.
    const handle = reportClientError({ error, code })
    setErrorRef(handle.errorRef)
  }, [error, code])

  async function copyRef() {
    if (errorRef === null) return
    try {
      await navigator.clipboard.writeText(errorRef)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A denied clipboard is not worth an error message on an error page.
      // The reference is on screen and selectable either way.
    }
  }

  return (
    <div
      role="alert"
      className={
        standalone
          ? 'relative isolate flex min-h-screen flex-col justify-center overflow-hidden bg-theme-bg px-6 py-16 text-theme-fg'
          : 'relative isolate overflow-hidden px-6 py-20 text-theme-fg sm:px-10'
      }
      style={standalone ? { minHeight: '100vh' } : undefined}
    >
      {/* One cropped shape. Enough that the page is composed rather than blank,
          not so much that a failure looks like a celebration. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 -z-10 hidden h-[26rem] w-[26rem] rounded-full opacity-[0.16] lg:block"
        style={{
          background:
            'repeating-conic-gradient(var(--brand-red) 0deg, var(--brand-red) 18deg, transparent 18deg, transparent 30deg)',
        }}
      />

      <div className="mx-auto w-full max-w-2xl">
        <p className="flex items-center gap-3 font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: 'var(--brand-red)' }}
          />
          Something broke
        </p>

        <h1 className="mt-6 text-title1 font-medium tracking-[-0.04125rem] sm:text-display2">
          Something went wrong
        </h1>

        <p className="mt-5 max-w-xl text-bodyXL leading-relaxed text-theme-muted">
          Pool Forge hit a problem while loading this. Your saved work has not been changed.
          Reloading usually clears it.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          {reset ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-[2.875rem] items-center justify-center rounded-brand bg-theme-fg px-[1.375rem] text-bodyL font-medium text-theme-bg transition-[background] duration-brand ease-brand hover:bg-[color-mix(in_oklch,var(--theme-fg),transparent_20%)]"
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
            className="inline-flex h-[2.875rem] items-center justify-center rounded-brand px-[1.375rem] text-bodyL font-medium text-theme-fg shadow-[inset_0_0_0_1px_var(--theme-border)] transition-[background] duration-brand ease-brand hover:bg-theme-card"
          >
            Back to dashboard
          </a>
        </div>

        {/* The reference. The one thing on this page support can act on, so it
            gets a field of its own rather than a line of small print. */}
        <div className="mt-12 rounded-brand16 border border-theme-line p-5 sm:p-6">
          <p className="font-brandMono text-formLabel uppercase tracking-[0.03125rem] text-theme-muted">
            Reference for support
          </p>
          {errorRef === null ? (
            <p className="mt-3 text-bodyS text-theme-faint">Preparing a reference…</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code
                data-testid="error-ref"
                className="select-all rounded-brand bg-theme-field px-3 py-2 font-brandMono text-bodyS tracking-[0.03125rem] text-theme-fg"
              >
                {errorRef}
              </code>
              <button
                type="button"
                onClick={copyRef}
                className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted underline underline-offset-4 transition-[color] duration-brand ease-brand hover:text-theme-fg"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          <p className="mt-4 max-w-md text-bodyS leading-relaxed text-theme-muted">
            Quote this and we can find exactly what happened. It identifies the fault, not
            you or your customer.
          </p>
        </div>
      </div>
    </div>
  )
}
