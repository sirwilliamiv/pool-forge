// The full-page loading state.
//
// Designed once here so every route can drop a `loading.tsx` that renders it,
// rather than each screen inventing its own spinner. Next streams this in the
// moment a navigation starts, so it is the first thing a builder sees on every
// slow page in the product — which makes it worth more than a spinner.
//
// Three decisions worth writing down:
//
// **It is not a spinner.** A spinner says "something is happening" and nothing
// else. The ray fan is already the brand's section marker, so turning it is a
// loading indicator that could not belong to any other product, and it costs one
// element and one keyframe.
//
// **It says what is loading.** "Loading" alone is the least useful word
// available. The caller passes the thing — "the price book", "this project" —
// so the wait is attached to an object, and the sentence reads the same way the
// rest of the product talks.
//
// **It reserves the layout it is replacing.** Below the message it draws the
// hairline blocks the real page will fill: a title, a couple of rows. Content
// arriving into roughly the shape already on screen is a much calmer transition
// than content arriving into an empty page, and it costs nothing because the
// shapes are the same tokens the real page uses.
//
// Reduced motion stops the rotation and leaves the mark still, because the
// message and the skeleton already carry the meaning.

export function PageLoading({
  what = 'this page',
  rows = 3,
}: {
  /** The thing being loaded, lower case, as it would appear mid-sentence. */
  what?: string
  /** How many placeholder rows to reserve under the title. */
  rows?: number
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="container flex min-h-[60vh] flex-col justify-center py-16"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-full bg-rayFan motion-safe:animate-[pf-spin_1.4s_linear_infinite]"
        />
        <p className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
          Loading {what}
        </p>
      </div>

      {/* The shape of what is coming. Hairlines and quiet fills, no shimmer:
          a pulsing gradient is a second animation competing with the mark. */}
      <div aria-hidden className="mt-10 max-w-3xl">
        <div className="h-9 w-2/5 rounded-brand bg-theme-card" />
        <div className="mt-8 flex flex-col gap-px overflow-hidden rounded-brand16 border border-theme-line">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-6 bg-theme-bg px-5 py-5">
              <div className="h-4 flex-1 rounded-brand bg-theme-card" style={{ maxWidth: `${68 - i * 9}%` }} />
              <div className="h-4 w-20 rounded-brand bg-theme-card" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading {what}. Please wait.</span>
    </div>
  )
}
