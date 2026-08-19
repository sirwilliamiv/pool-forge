'use client'

import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DesignIntent } from '@/modules/imports/intent'
import type { DesignIntentPatch } from '@/modules/imports/patch'
import { FeatureList } from './FeatureList'
import { confidenceFor } from './gates'
import { IntentFieldRow } from './IntentField'
import {
  INTENT_GROUPS,
  INTENT_GROUP_META,
  fieldsInGroup,
  type IntentGroupId,
} from './intent-fields'
import { ReviewQueue } from './ReviewQueue'

// The editable half. Every control here commits through `onCommit`, which
// dispatches `import.intent.patch`; nothing on this screen writes intent state
// locally, because the patch command is what records the correction and what
// clears the review gate.

export interface IntentPaneProps {
  intent: DesignIntent
  unreviewed: string[]
  pendingPaths: ReadonlySet<string>
  disabled: boolean
  onCommit: (path: string, patch: DesignIntentPatch) => void
  onJump: (path: string) => void
}

export function IntentPane({
  intent,
  unreviewed,
  pendingPaths,
  disabled,
  onCommit,
  onJump,
}: IntentPaneProps) {
  const blocking = new Set(unreviewed)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
      <div className="border-b border-borderLight px-4 py-3">
        <ReviewQueue intent={intent} unreviewed={unreviewed} onJump={onJump} />
      </div>

      {intent.warnings.length > 0 ? (
        <div className="border-b border-borderLight bg-warnSoft/60 px-4 py-2.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
            <Info className="h-3 w-3" aria-hidden />
            Extractor notes
          </h3>
          <ul className="mt-1 space-y-0.5">
            {intent.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`} className="text-[11px] leading-snug text-amber-900">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {INTENT_GROUPS.map((group) => (
        <IntentGroupSection
          key={group}
          group={group}
          intent={intent}
          blocking={blocking}
          pendingPaths={pendingPaths}
          disabled={disabled}
          onCommit={onCommit}
        />
      ))}
    </div>
  )
}

function IntentGroupSection({
  group,
  intent,
  blocking,
  pendingPaths,
  disabled,
  onCommit,
}: {
  group: IntentGroupId
  intent: DesignIntent
  blocking: ReadonlySet<string>
  pendingPaths: ReadonlySet<string>
  disabled: boolean
  onCommit: (path: string, patch: DesignIntentPatch) => void
}) {
  const meta = INTENT_GROUP_META[group]
  const fields = fieldsInGroup(group)
  const blockingCount =
    fields.filter((f) => blocking.has(f.path)).length +
    (group === 'features' && blocking.has('features') ? 1 : 0)

  return (
    <section id={`intent-group-${group}`} className="border-b border-borderLight last:border-b-0">
      <header className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-borderLight bg-white/95 px-4 py-2 backdrop-blur">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {meta.label}
        </h2>
        <p className="min-w-0 flex-1 truncate text-[10.5px] text-textFaint">{meta.blurb}</p>
        {blockingCount > 0 ? (
          <span
            className={cn(
              'shrink-0 rounded-full bg-pfError px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white',
            )}
          >
            {blockingCount} to review
          </span>
        ) : null}
      </header>

      {group === 'features' ? (
        <FeatureList
          intent={intent}
          disabled={disabled}
          pending={pendingPaths.has('features')}
          onCommit={onCommit}
        />
      ) : (
        <div className="divide-y divide-borderLight">
          {fields.map((descriptor) => (
            <IntentFieldRow
              key={descriptor.path}
              descriptor={descriptor}
              intent={intent}
              score={confidenceFor(intent, descriptor.path)}
              blocking={blocking.has(descriptor.path)}
              pending={pendingPaths.has(descriptor.path)}
              disabled={disabled}
              onCommit={onCommit}
            />
          ))}
        </div>
      )}

      {group === 'site' ? <SiteExtras intent={intent} /> : null}
    </section>
  )
}

function SiteExtras({ intent }: { intent: DesignIntent }) {
  const setbacks = intent.site.setbacksFt
  const hasSetbacks =
    setbacks !== null &&
    (setbacks.front !== null ||
      setbacks.rear !== null ||
      setbacks.left !== null ||
      setbacks.right !== null)

  if (!hasSetbacks && intent.site.notes.length === 0) return null

  return (
    <div className="space-y-2 border-t border-borderLight px-4 py-2.5">
      {hasSetbacks && setbacks !== null ? (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
            Setbacks read from the plan
          </h3>
          <dl className="mt-1 grid grid-cols-4 gap-1.5">
            {(
              [
                ['Front', setbacks.front],
                ['Rear', setbacks.rear],
                ['Left', setbacks.left],
                ['Right', setbacks.right],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-pfXs bg-rowHover px-2 py-1">
                <dt className="text-[9.5px] uppercase tracking-wider text-textFaint">{label}</dt>
                <dd className="text-[11.5px] tabular-nums">
                  {value === null ? 'Not read' : `${value} ft`}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {intent.site.notes.length > 0 ? (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
            Notes
          </h3>
          <ul className="mt-1 space-y-0.5">
            {intent.site.notes.map((note, index) => (
              <li key={`${note}-${index}`} className="text-[11px] leading-snug text-textMuted">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
