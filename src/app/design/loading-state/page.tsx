import type { Metadata } from 'next'

import { PageLoading } from '@/components/monitoring/PageLoading'

// The loading state, held still.
//
// A real `loading.tsx` is only on screen for as long as the page under it takes
// to arrive, which on a fast local database is a flash you cannot judge. This
// route renders the same component permanently so it can be looked at, argued
// with, and changed before it is rolled out to every route.
//
// Three settings, because the component takes what is loading and how many rows
// to reserve, and the whole point of naming the thing is that it reads
// differently per page.
//
// Deliberately not linked from anywhere, and deleted once the design is settled.

export const metadata: Metadata = {
  title: 'Loading state · design',
  robots: { index: false, follow: false },
}

const SAMPLES = [
  { what: 'the price book', rows: 5, note: 'The slowest page in the product, and the one this was designed against.' },
  { what: 'this project', rows: 3, note: 'The common case: a handful of rows under a title.' },
  { what: 'your projects', rows: 2, note: 'Short, for a page that fills quickly.' },
] as const

export default function LoadingDesignPage() {
  return (
    <main className="min-h-screen bg-theme-bg px-6 py-16 font-display text-theme-fg sm:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
          Design · not shipped
        </p>
        <h1 className="mt-4 text-title1 font-medium tracking-[-0.04125rem] sm:text-display2">
          The loading state
        </h1>
        <p className="mt-5 max-w-2xl text-bodyXL leading-relaxed text-theme-muted">
          Held still so it can be judged. In the product it appears the moment a navigation
          starts and leaves as soon as the page arrives, which on a fast database is a flash.
        </p>

        <div className="mt-8 max-w-2xl space-y-4 text-bodyL leading-relaxed text-theme-muted">
          <p>
            <span className="text-theme-fg">It is not a spinner.</span> A spinner says
            something is happening and nothing else. The ray fan is already the brand&apos;s
            section marker, so turning it is an indicator that could not belong to another
            product, and it costs one element and one keyframe.
          </p>
          <p>
            <span className="text-theme-fg">It names what is loading.</span> &ldquo;Loading&rdquo;
            on its own is the least useful word available. Each route passes its own thing, so
            the wait is attached to an object and the sentence reads the way the rest of the
            product talks.
          </p>
          <p>
            <span className="text-theme-fg">It reserves the shape underneath.</span> The
            blocks are roughly where the real title and rows will land. Content arriving into
            about the right shape is a much calmer transition than content arriving into an
            empty page, and it costs nothing because those are the same tokens the real page
            uses.
          </p>
          <p>
            Reduced motion stops the rotation and leaves the mark still. The message and the
            reserved shape already carry the meaning.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-12">
          {SAMPLES.map((sample) => (
            <section key={sample.what}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <span className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
                  {sample.what}
                </span>
                <span className="text-bodyS text-theme-faint">{sample.note}</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-brand16 border border-theme-line">
                <PageLoading what={sample.what} rows={sample.rows} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
