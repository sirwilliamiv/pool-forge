'use client'

import { cn } from '@/lib/utils'
import {
  CONFIDENCE_HIGH,
  CONFIDENCE_REVIEW_REQUIRED,
  confidenceBand,
  type ConfidenceBand,
} from '@/modules/imports/intent'

// Bands come straight from `intent.ts` so the badge can never disagree with
// the gate: green at or above 0.85, amber from 0.6, red below 0.6.

export const BAND_LABELS: Record<ConfidenceBand, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Review',
}

const BAND_CLASSES: Record<ConfidenceBand, string> = {
  high: 'border-emerald-600/30 bg-emerald-50 text-emerald-700',
  medium: 'border-amber-500/40 bg-warnSoft text-amber-800',
  // Low is the one state that must be unmistakable across a dense pane, so it
  // is the only filled badge on the screen.
  low: 'border-transparent bg-pfError text-white',
}

const DOT_CLASSES: Record<ConfidenceBand, string> = {
  high: 'bg-emerald-600',
  medium: 'bg-pfWarn',
  low: 'bg-white',
}

export const BAND_RAIL_CLASSES: Record<ConfidenceBand, string> = {
  high: 'bg-emerald-500/60',
  medium: 'bg-pfWarn',
  low: 'bg-pfError',
}

export function bandExplanation(band: ConfidenceBand): string {
  if (band === 'high') {
    return `Read at ${Math.round(CONFIDENCE_HIGH * 100)}% confidence or better. Applies as read.`
  }
  if (band === 'medium') {
    return `Read at ${Math.round(CONFIDENCE_REVIEW_REQUIRED * 100)}% to ${Math.round(
      CONFIDENCE_HIGH * 100,
    )}% confidence. Worth a glance, but it applies as read.`
  }
  return `Below ${Math.round(
    CONFIDENCE_REVIEW_REQUIRED * 100,
  )}% confidence. This will not apply until you correct or confirm it.`
}

export interface ConfidenceBadgeProps {
  /** Null when the extractor never scored this path. */
  score: number | null
  className?: string
}

export function ConfidenceBadge({ score, className }: ConfidenceBadgeProps) {
  if (score === null) {
    return (
      <span
        data-band="unscored"
        title="The extractor did not score this field."
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium leading-none text-textFaint',
          className,
        )}
      >
        Not scored
      </span>
    )
  }

  const band = confidenceBand(score)
  const percent = Math.round(score * 100)

  return (
    <span
      data-band={band}
      data-confidence={score}
      title={bandExplanation(band)}
      aria-label={`Confidence ${percent} percent, ${BAND_LABELS[band].toLowerCase()}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        BAND_CLASSES[band],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[band])} aria-hidden />
      <span className="tabular-nums">{percent}%</span>
      {band === 'low' ? <span className="uppercase tracking-wide">Review</span> : null}
    </span>
  )
}
