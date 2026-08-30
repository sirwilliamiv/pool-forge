// The full-page loading state.
//
// Designed once here so every route can drop a `loading.tsx` that renders it,
// rather than each screen inventing its own spinner. Next streams this in the
// moment a navigation starts, so it is the first thing a builder sees on every
// slow page in the product.
//
// **It is a pool, filling.** A spinner says something is happening and nothing
// else, and it would look the same in any product in the world. This is a pool
// in plan with its coping band, the water cycling through the five core hues,
// and a ripple going out from the middle the way one does when something lands
// in it. It could not belong to anything but this.
//
// The hue steps rather than blends. The spectrum is meant to read as five flat
// colours and interpolating between them lands on exactly the muddy midpoints
// the palette exists to avoid — the same reason the read-next cards on the
// marketing pages step too.
//
// **It says what is loading.** "Loading" on its own is the least useful word
// available, so the caller passes the thing — "the price book", "this project" —
// and the wait is attached to an object.
//
// Reduced motion holds the water on brand blue and stops the ripple. The mark
// still reads as a pool and the message still says what is happening; nothing
// meaningful is carried by the animation alone.

export function PageLoading({
  what = 'this page',
}: {
  /** The thing being loaded, lower case, as it would appear mid-sentence. */
  what?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-6 py-16"
    >
      <svg
        viewBox="0 0 240 150"
        className="h-auto w-52"
        aria-hidden
        focusable="false"
      >
        {/* Coping: the band round the edge, same hairline as everything else. */}
        <rect
          x="4"
          y="4"
          width="232"
          height="142"
          rx="20"
          fill="none"
          stroke="var(--theme-border)"
          strokeWidth="2"
        />

        {/* The water. One shape, one animated fill. */}
        <rect
          x="16"
          y="16"
          width="208"
          height="118"
          rx="12"
          className="pf-pool-water"
        />

        {/* Something landed in it. Three rings, staggered, going out and
            fading. Clipped to the water so the ripple stays in the pool. */}
        <clipPath id="pf-pool-clip">
          <rect x="16" y="16" width="208" height="118" rx="12" />
        </clipPath>
        <g clipPath="url(#pf-pool-clip)" className="pf-pool-ripples">
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx="120"
              cy="75"
              r="18"
              fill="none"
              stroke="var(--ink-white)"
              strokeWidth="2.5"
              className="pf-pool-ripple"
              style={{ animationDelay: `${i * 0.75}s` }}
            />
          ))}
        </g>

        {/* Steps at the shallow end, so it reads as a pool and not a swatch. */}
        <path
          d="M16 44 h34 M16 66 h34 M16 88 h34"
          stroke="var(--ink-white)"
          strokeOpacity="0.55"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      <p className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
        Loading {what}
      </p>

      <span className="sr-only">Loading {what}. Please wait.</span>
    </div>
  )
}
