'use client'

import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import type { DesignIntent } from '@/modules/imports/intent'
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

export interface ReviewQueueProps {
  intent: DesignIntent
  unreviewed: string[]
  onJump: (path: string) => void
}

export function ReviewQueue({ intent, unreviewed, onJump }: ReviewQueueProps) {
  if (unreviewed.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-pfMd border border-emerald-600/20 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Every low-confidence field has been reviewed.</span>
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
      className="overflow-hidden rounded-pfMd border border-pfError/30 bg-white shadow-pfSm"
    >
      <header className="flex items-center gap-2 border-b border-pfError/20 bg-errorSoft px-3 py-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-700" aria-hidden />
        <h3 className="text-[11.5px] font-semibold text-red-800">{heading}</h3>
        <p className="ml-auto text-[10.5px] text-red-700">
          {summarise(unreviewed)}
        </p>
      </header>
      <ul className="divide-y divide-borderLight">
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
                  'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                  'hover:bg-errorSoft/60 focus:bg-errorSoft/60 focus:outline-none',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-medium text-foreground">
                    {labelForPath(path)}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-textMuted">
                    {group === null ? 'Design intent' : INTENT_GROUP_META[group].label}
                    {score === null ? '' : ` · read at ${Math.round(score * 100)}%`}
                    {descriptor === undefined ? ' · no editor on this screen' : ''}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-textFaint" aria-hidden />
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
