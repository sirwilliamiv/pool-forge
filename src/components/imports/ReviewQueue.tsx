'use client'

import { AlertCircle, ArrowRight, CheckCircle2, CircleDashed } from 'lucide-react'
import { fieldsRequiringReview, type DesignIntent } from '@/modules/imports/intent'
import { cn } from '@/lib/utils'
import { confidenceFor } from './gates'
import { INTENT_GROUP_META, fieldByPath, groupForPath, labelForPath } from './intent-fields'

// Gate 2, made actionable. `unreviewedFieldPaths()` returns dotted paths; this
// turns them into named fields with a click-to-jump target, the same way
// `ValidationDock` turns a validation item's `targetId` into a selection.
//
// A path with no field row still lists, still names its group, and still says
// why: silently hiding a blocker is how a user reaches a server rejection they
// could not have predicted.
//
// An empty queue is NOT automatically good news. Before anything has been read
// there are no confidence scores, so "every low-confidence field has been
// reviewed" was true of the empty set and shown over fifteen fields reading
// "Not read / Not scored" — a green tick claiming a review nobody performed of
// data nobody extracted. Three states, and the difference between them is
// whether the extractor scored anything at all.

export interface ReviewQueueProps {
  intent: DesignIntent
  unreviewed: string[]
  onJump: (path: string) => void
}

/**
 * How many fields the extractor actually read and scored.
 *
 * `fieldConfidence` is only written for a field an extractor produced a value
 * for, so an empty map means nothing was read: no review is possible, let alone
 * complete.
 */
export function scoredFieldCount(intent: DesignIntent): number {
  return Object.keys(intent.fieldConfidence).length
}

export function ReviewQueue({ intent, unreviewed, onJump }: ReviewQueueProps) {
  const scored = scoredFieldCount(intent)

  if (scored === 0) {
    return (
      <div className="flex items-start gap-2 rounded-brand12 border border-theme-line bg-theme-card px-3 py-2 text-bodyS text-theme-muted">
        <CircleDashed className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-theme-fg">Nothing to review yet.</span> No field has
          been read from this image, so none has a confidence score. Run the analysis, or fill the
          fields in yourself, and anything read with low confidence will be listed here.
        </span>
      </div>
    )
  }

  if (unreviewed.length === 0) {
    const reviewed = fieldsRequiringReview(intent).length
    return (
      <div className="flex items-start gap-2 rounded-brand12 border border-brand-green/20 bg-tint-mint px-3 py-2 text-bodyS text-theme-fg">
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {reviewed === 0
            ? `All ${scored} ${scored === 1 ? 'field' : 'fields'} read from this image scored above the review threshold. None needs your confirmation.`
            : `All ${reviewed} low-confidence ${reviewed === 1 ? 'field' : 'fields'} of the ${scored} read from this image ${reviewed === 1 ? 'has' : 'have'} been reviewed.`}
        </span>
      </div>
    )
  }

  const heading =
    unreviewed.length === 1
      ? '1 field needs your review'
      : `${unreviewed.length} fields need your review`

  return (
    <section
      aria-label="Fields needing review"
      className="overflow-hidden rounded-brand12 border border-brand-red/30 bg-theme-bg shadow-elevation1"
    >
      <header className="flex items-center gap-2 border-b border-brand-red/20 bg-tint-blush px-3 py-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-brand-red" aria-hidden />
        <h3 className="text-bodyS font-semibold text-theme-fg">{heading}</h3>
        <p className="ml-auto text-formLabel text-theme-fg">{summarise(unreviewed)}</p>
      </header>
      <ul className="divide-y divide-theme-lineSoft">
        {unreviewed.map((path) => {
          const descriptor = fieldByPath(path)
          const group = groupForPath(path)
          const score = confidenceFor(intent, path)
          return (
            <li key={path}>
              <button
                type="button"
                onClick={() => onJump(path)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-brand ease-brand',
                  'hover:bg-tint-blush/60 focus:bg-tint-blush/60 focus:outline-none',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-bodyS font-medium text-theme-fg">
                    {labelForPath(path)}
                  </div>
                  <div className="mt-0.5 font-brandMono text-formLabel uppercase tracking-wide text-theme-muted">
                    {group === null ? 'Design intent' : INTENT_GROUP_META[group].label}
                    {score === null ? '' : ` · read at ${Math.round(score * 100)}%`}
                    {descriptor === undefined ? ' · no editor on this screen' : ''}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-theme-faint" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** "Pool length, deck material, spa size" for the compact header line. */
export function summarise(paths: string[], limit = 3): string {
  const names = paths.slice(0, limit).map((path) => labelForPath(path).toLowerCase())
  const remainder = paths.length - names.length
  const joined = names.join(', ')
  return remainder > 0 ? `${joined}, and ${remainder} more` : joined
}
