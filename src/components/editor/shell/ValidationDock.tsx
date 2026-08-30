'use client'

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { dispatch } from '@/lib/commands/dispatch'
import { humanFieldName } from '@/lib/human-field'
import { cn } from '@/lib/utils'
import { focusRing, useFocusFlash } from './useFocusFlash'
import type {
  ValidationItem,
  ValidationLevel,
  ValidationReport,
} from '@/modules/validation/types'

interface ValidationDockProps {
  validationResult: ValidationReport | null
}

interface ItemWithFix extends ValidationItem {
  targetId?: string
  suggestedFix?: string
}

function withTarget(item: ValidationItem): ItemWithFix {
  const meta = item as ItemWithFix
  const out: ItemWithFix = { ...item }
  if (typeof meta.targetId === 'string') out.targetId = meta.targetId
  if (typeof meta.suggestedFix === 'string') out.suggestedFix = meta.suggestedFix
  return out
}

export function ValidationDock({ validationResult }: ValidationDockProps) {
  const [expanded, setExpanded] = useState(false)

  const counts = validationResult?.counts ?? { error: 0, warn: 0, pass: 0 }
  const items = useMemo(
    () => (validationResult?.items ?? []).map(withTarget),
    [validationResult],
  )

  const flashing = useFocusFlash('validation')

  // Being pointed at a collapsed panel is being pointed at nothing. The palette
  // and the voice agent both send people here with "show me the checklist", and
  // the fix wording each issue carries is inside the list, not on the three
  // coloured counts.
  useEffect(() => {
    if (flashing) setExpanded(true)
  }, [flashing])

  async function jumpTo(item: ItemWithFix) {
    if (!item.targetId) return
    await dispatch('selection.set', { ids: [item.targetId] })
  }

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-pfMd border border-border bg-white shadow-pfMd transition-all',
        expanded ? 'w-[280px]' : 'w-auto',
        focusRing(flashing),
      )}
      data-guide-scope="validation-dock"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`Checklist: ${counts.error} errors, ${counts.warn} warnings, ${counts.pass} passed`}
        className="flex w-full items-center gap-1 rounded-pfMd px-1.5 py-1 text-left hover:bg-rowHover focus:outline-none focus:ring-2 focus:ring-pfAccent"
      >
        {/* The word matters. Three coloured numbers with no label was read by a
            first-time user as "a cluster I cannot guess", and this is the panel
            the palette sends people to. */}
        <span className="pl-1 pr-0.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
          Checklist
        </span>
        <div className="flex items-center gap-1">
          <Pill
            tone="error"
            count={counts.error}
            icon={<AlertCircle className="h-2.5 w-2.5" aria-hidden />}
          />
          <Pill
            tone="warn"
            count={counts.warn}
            icon={<AlertTriangle className="h-2.5 w-2.5" aria-hidden />}
          />
          <Pill
            tone="ok"
            count={counts.pass}
            icon={<CheckCircle2 className="h-2.5 w-2.5" aria-hidden />}
          />
        </div>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-textMuted" />
        ) : (
          <ChevronDown className="h-3 w-3 text-textMuted" />
        )}
      </button>

      {expanded && (
        <div className="max-h-[40vh] overflow-y-auto border-t border-borderLight">
          {items.length === 0 ? (
            <div className="p-3 text-xs text-textMuted">No issues.</div>
          ) : (
            <ul className="divide-y divide-borderLight">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(item)}
                    disabled={!item.targetId}
                    className="flex w-full items-start gap-2 p-2 text-left text-xs hover:bg-rowHover focus:bg-rowHover focus:outline-none disabled:cursor-default"
                  >
                    <LevelIcon level={item.level} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">
                        {item.message}
                      </div>
                      {/* Not `POOL · DEPTHSHALLOW`. The category is a word;
                          the field was an internal key printed in capitals. */}
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-textMuted">
                        {item.category}
                        {item.field ? ` · ${humanFieldName(item.field)}` : ''}
                      </div>
                      {item.suggestedFix && (
                        <div className="mt-0.5 text-[10px] text-pfAccentStrong">
                          {item.suggestedFix}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Pill({
  tone,
  count,
  icon,
}: {
  tone: 'error' | 'warn' | 'ok'
  count: number
  icon: React.ReactNode
}) {
  const className =
    tone === 'error'
      ? 'border-red-500/40 bg-errorSoft text-red-700'
      : tone === 'warn'
        ? 'border-amber-500/40 bg-warnSoft text-amber-700'
        : 'border-emerald-500/40 bg-emerald-50 text-emerald-700'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-1 py-0.5 text-[10px] font-medium leading-none',
        className,
      )}
    >
      {icon}
      <span className="tabular-nums">{count}</span>
    </span>
  )
}

function LevelIcon({ level }: { level: ValidationLevel }) {
  if (level === 'error')
    return <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
  if (level === 'warn')
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
  return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
}
