'use client'

// A figure that travels to its new value instead of jumping to it.
//
// This is the only animation on the page and it earns its place: the change in
// the number is the feedback. A price that silently swaps from $84,000 to
// $95,000 has not told anybody that the last click cost eleven thousand
// dollars, and noticing that is the entire loop this page runs on.
//
// Short and eased out, so it reads as a dial settling rather than a slot
// machine. Skipped outright when the visitor has asked for reduced motion:
// somebody who gets motion sick from a counting number still needs the price.

import { useEffect, useRef, useState } from 'react'

const DURATION_MS = 460

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Ease-out cubic: fast at first, so the direction of travel is obvious. */
function ease(t: number): number {
  return 1 - (1 - t) ** 3
}

export function RollingMoney({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = value
      setShown(value)
      return
    }

    const from = fromRef.current
    if (from === value) return

    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      setShown(Math.round(from + (value - from) * ease(t)))
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = value
      }
    }
    frameRef.current = requestAnimationFrame(step)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      // Land on the target if the value changes again mid-flight, so the next
      // animation starts from what is on screen rather than from a stale figure.
      fromRef.current = value
    }
  }, [value])

  return (
    <span className={className}>
      {/* The live figure is announced once it settles, not on every frame: a
          screen reader reading four hundred intermediate numbers is worse than
          no announcement at all. */}
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only" aria-live="polite">
        {format(value)}
      </span>
    </span>
  )
}

function format(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`
}
