// The full-page loading state.
//
// Designed once here so every route can drop a `loading.tsx` that renders it,
// rather than each screen inventing its own spinner. Next streams this in the
// moment a navigation starts, so it is the first thing a builder sees on every
// slow page in the product.
//
// **It is a pool, with a yard around it.** A spinner says something is
// happening and nothing else, and it would look identical in any product in the
// world. This is a pool in plan: coping band, steps at the shallow end, a board
// cantilevered over the deep end, two loungers and a parasol on the deck. The
// water cycles the five core hues, a ripple goes out from the middle the way one
// does when something lands in it, and the parasol turns.
//
// The hue steps rather than blends. The spectrum is meant to read as five flat
// colours and interpolating between them lands on exactly the muddy midpoints
// the palette exists to avoid — the same reason the read-next cards on the
// marketing pages step.
//
// The furniture is ink, not colour. Everything on the deck is drawn as a flat
// silhouette so the water is the only thing carrying a hue; give the loungers
// their own colours and the mark stops being a pool and becomes a diagram.
//
// **It says what is loading.** "Loading" on its own is the least useful word
// available, so the caller passes the thing — "the price book", "this project" —
// and the wait is attached to an object.
//
// Reduced motion holds the water on brand blue, stops the ripple and stops the
// parasol. It still reads as a pool; nothing meaningful is carried by movement
// alone.

/** A lounger in plan, facing the water. Back, seat, two legs. */
function Lounger({ y }: { y: number }) {
  return (
    <g fill="var(--theme-fg)" opacity="0.72">
      {/* Back, raked toward the pool. */}
      <path d={`M20 ${y - 20} L33 ${y - 24} L36 ${y - 8} L23 ${y - 5} Z`} />
      {/* Seat. */}
      <rect x="23" y={y - 7} width="52" height="7" rx="3.5" />
      {/* Legs. */}
      <rect x="30" y={y} width="4.5" height="8" rx="2" />
      <rect x="66" y={y} width="4.5" height="8" rx="2" />
    </g>
  )
}

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
      <svg viewBox="0 0 420 190" className="h-auto w-80" aria-hidden focusable="false">
        {/* ── The deck ─────────────────────────────────────────────────── */}

        {/* Parasol, from above: a disc with spokes, turning. */}
        <g className="pf-pool-parasol">
          <circle cx="52" cy="46" r="27" fill="var(--tint-sand)" />
          <g stroke="var(--ink-white)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M52 21 V71 M27 46 H77 M34 28 L70 64 M70 28 L34 64" />
          </g>
          <circle cx="52" cy="46" r="3.5" fill="var(--theme-fg)" opacity="0.72" />
        </g>

        <Lounger y={116} />
        <Lounger y={152} />

        {/* ── The pool ─────────────────────────────────────────────────── */}

        {/* Coping: the band round the edge, same hairline as everything else. */}
        <rect
          x="112"
          y="20"
          width="252"
          height="150"
          rx="20"
          fill="none"
          stroke="var(--theme-border)"
          strokeWidth="2"
        />

        {/* The water. One shape, one animated fill. */}
        <rect x="124" y="32" width="228" height="126" rx="12" className="pf-pool-water" />

        {/* Something landed in it. Three rings, staggered, going out and
            fading. Clipped to the water so the ripple stays in the pool. */}
        <clipPath id="pf-pool-clip">
          <rect x="124" y="32" width="228" height="126" rx="12" />
        </clipPath>
        <g clipPath="url(#pf-pool-clip)">
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx="238"
              cy="95"
              r="18"
              fill="none"
              stroke="var(--ink-white)"
              strokeWidth="2.5"
              className="pf-pool-ripple"
              style={{ animationDelay: `${i * 0.75}s` }}
            />
          ))}
        </g>

        {/* Steps at the shallow end. */}
        <path
          d="M124 58 h34 M124 82 h34 M124 106 h34"
          stroke="var(--ink-white)"
          strokeOpacity="0.55"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Board, anchored on the deck beyond the coping and cantilevered back
            over the deep end. The post has to stand on the deck rather than in
            the water, which is the difference between a diving board and a
            plank someone left floating. Steps at one end and a board at the
            other is also the right way round: you get in where it is shallow
            and jump in where it is not. */}
        <rect x="292" y="90" width="112" height="10" rx="5" fill="var(--theme-fg)" opacity="0.72" />
        <rect x="386" y="100" width="9" height="28" rx="3" fill="var(--theme-fg)" opacity="0.72" />
      </svg>

      <p className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
        Loading {what}
      </p>

      <span className="sr-only">Loading {what}. Please wait.</span>
    </div>
  )
}
