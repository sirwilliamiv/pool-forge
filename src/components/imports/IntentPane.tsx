'use client'

import { Info } from 'lucide-react'
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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-theme-bg">
      <div className="border-b border-theme-lineSoft px-4 py-3">
        <ReviewQueue intent={intent} unreviewed={unreviewed} onJump={onJump} />
      </div>

      {intent.warnings.length > 0 ? (
        <div className="border-b border-theme-lineSoft bg-tint-sand/60 px-4 py-2.5">
          <h3 className="flex items-center gap-1.5 font-brandMono text-formLabel uppercase text-theme-fg">
            <Info className="h-3 w-3" aria-hidden />
            Extractor notes
          </h3>
          <ul className="mt-1 space-y-0.5">
            {intent.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`} className="text-formLabel leading-snug text-theme-fg">
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
    <section id={`intent-group-${group}`} className="border-b border-theme-lineSoft last:border-b-0">
      <header className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-theme-lineSoft bg-theme-bg/95 px-4 py-2 backdrop-blur">
        <h2 className="font-brandMono text-formLabel uppercase text-theme-fg">{meta.label}</h2>
        <p className="min-w-0 flex-1 truncate text-formLabel text-theme-faint">{meta.blurb}</p>
        {blockingCount > 0 ? (
          <span className="shrink-0 rounded-full bg-brand-red px-1.5 py-0.5 font-brandMono text-formLabel uppercase tracking-wide text-ink-black">
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
        <div className="divide-y divide-theme-lineSoft">
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
    <div className="space-y-2 border-t border-theme-lineSoft px-4 py-2.5">
      {hasSetbacks && setbacks !== null ? (
        <div>
          <h3 className="font-brandMono text-formLabel uppercase text-theme-muted">
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
              <div key={label} className="rounded-brand4 bg-theme-card px-2 py-1">
                <dt className="font-brandMono text-formLabel uppercase tracking-wider text-theme-faint">
                  {label}
                </dt>
                <dd className="text-bodyS tabular-nums text-theme-fg">
                  {value === null ? 'Not read' : `${value} ft`}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {intent.site.notes.length > 0 ? (
        <div>
          <h3 className="font-brandMono text-formLabel uppercase text-theme-muted">Notes</h3>
          <ul className="mt-1 space-y-0.5">
            {intent.site.notes.map((note, index) => (
              <li key={`${note}-${index}`} className="text-formLabel leading-snug text-theme-muted">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
