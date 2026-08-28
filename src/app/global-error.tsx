'use client'

// Last-resort boundary: an error in the root layout itself, which `error.tsx`
// cannot catch because it renders inside that layout. It replaces the whole
// document, so it must supply its own `<html>` and `<body>` and cannot assume
// the app's providers, fonts or global CSS ever loaded.
//
// Without this file such an error renders Next's built-in error page in
// production, which shows the user nothing they can quote to support. With it,
// even a total failure still produces an `err_<12 hex>` reference on screen.

import { ErrorFallback } from '@/components/monitoring/ErrorFallback'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <ErrorFallback error={error} code="global_boundary" standalone />
      </body>
    </html>
  )
}
