'use client'

import { useEffect, useRef } from 'react'

import { holdLoadingFrom, markLoadingMounted } from '@/lib/loading-hold'

// The full-page loading state.
//
// Designed once here so every route can drop a `loading.tsx` that renders it,
// rather than each screen inventing its own spinner. Next streams this in the
// moment a navigation starts, so it is the first thing a builder sees on every
// slow page in the product.
//
// **It is a pool with a parasol at either end.** A spinner says something is
// happening and nothing else, and it would look identical in any product in the
// world. This is a pool in plan: coping band, steps at the shallow end, water
// cycling the five core hues, a ripple going out from the middle the way one
// does when something lands in it, and two parasols turning on the deck.
//
// It had loungers and a diving board too. They went: at this size the deck
// furniture crowded the water, which is the part actually doing the work, and a
// mark that needs to be read in under a second cannot afford detail that only
// resolves if you stop and look. Two parasols either side is the same idea with
// the noise taken out, and it makes the composition symmetrical about the pool
// rather than weighted to one end.
//
// The hue steps rather than blends. The spectrum is meant to read as five flat
// colours and interpolating between them lands on exactly the muddy midpoints
// the palette exists to avoid — the same reason the read-next cards on the
// marketing pages step.
//
// **It says what is loading.** "Loading" on its own is the least useful word
// available, so the caller passes the thing — "the price book", "this project" —
// and the wait is attached to an object.
//
// Reduced motion holds the water on brand blue and stops both the ripple and
// the parasols. It still reads as a pool; nothing meaningful is carried by
// movement alone.
//
// **And it keeps a minimum.** A pool that flashes for eighty milliseconds on
// one navigation and sits for two seconds on the next feels like two different
// apps, so once shown it stays up at least `LOADING_MIN_MS` and then fades.
// React tears a Suspense fallback down the instant the page is ready, so the
// hold happens outside React: see `src/lib/loading-hold.ts`.

/**
 * A parasol from above: a disc with spokes.
 *
 * The two turn in opposite directions. Same speed and direction reads as one
 * mechanism with two heads; opposed, they read as two separate things in the
 * same breeze.
 */
function Parasol({ cx, cy, reverse = false }: { cx: number; cy: number; reverse?: boolean }) {
  const r = 30
  return (
    <g className={reverse ? 'pf-pool-parasol pf-pool-parasol--reverse' : 'pf-pool-parasol'}>
      <circle cx={cx} cy={cy} r={r} fill="var(--tint-sand)" />
      <g stroke="var(--ink-white)" strokeWidth="2.5" strokeLinecap="round">
        <path
          d={`M${cx} ${cy - r} V${cy + r} M${cx - r} ${cy} H${cx + r}
              M${cx - r * 0.71} ${cy - r * 0.71} L${cx + r * 0.71} ${cy + r * 0.71}
              M${cx + r * 0.71} ${cy - r * 0.71} L${cx - r * 0.71} ${cy + r * 0.71}`}
        />
      </g>
      <circle cx={cx} cy={cy} r="3.5" fill="var(--theme-fg)" opacity="0.72" />
    </g>
  )
}

export function PageLoading({
  what = 'this page',
}: {
  /** The thing being loaded, lower case, as it would appear mid-sentence. */
  what?: string
}) {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    markLoadingMounted()
    const stage = stageRef.current
    return () => holdLoadingFrom(stage)
  }, [])

  return (
    <div
      ref={stageRef}
      role="status"
      aria-live="polite"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-6 py-16"
    >
      <svg viewBox="0 0 420 190" className="h-auto w-80" aria-hidden focusable="false">
        <Parasol cx={52} cy={95} />

        {/* Coping: the band round the edge, same hairline as everything else. */}
        <rect
          x="112"
          y="22"
          width="196"
          height="146"
          rx="20"
          fill="none"
          stroke="var(--theme-border)"
          strokeWidth="2"
        />

        {/* The water. One shape, one animated fill. */}
        <rect x="124" y="34" width="172" height="122" rx="12" className="pf-pool-water" />

        {/* Something landed in it. Three rings, staggered, going out and
            fading. Clipped to the water so the ripple stays in the pool. */}
        <clipPath id="pf-pool-clip">
          <rect x="124" y="34" width="172" height="122" rx="12" />
        </clipPath>
        <g clipPath="url(#pf-pool-clip)">
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx="210"
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

        {/* Steps at the shallow end. The one piece of detail that survives,
            because it is what makes the rectangle read as a pool rather than as
            a swatch. */}
        <path
          d="M124 58 h30 M124 82 h30 M124 106 h30"
          stroke="var(--ink-white)"
          strokeOpacity="0.55"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        <Parasol cx={368} cy={95} reverse />
      </svg>

      <p className="font-brandMono text-badge uppercase tracking-[0.03125rem] text-theme-muted">
        Loading {what}
      </p>

      <span className="sr-only">Loading {what}. Please wait.</span>
    </div>
  )
}
