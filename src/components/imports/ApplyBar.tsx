'use client'

import { AlertTriangle, Loader2, Ruler, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DesignIntent } from '@/modules/imports/intent'
import {
  describeApplyDiff,
  describeApplyDiffItem,
  itemsBlockedByScale,
  summarizeApplyDiff,
} from './apply-diff'
import type { ApplyGateResult } from './gates'
import { summarise } from './ReviewQueue'

// The footer states exactly what Apply will create, before it creates it, and
// when it will not run it says which gate is holding it rather than showing a
// dead button. A disabled control with no explanation is the thing that makes
// a review screen feel like it is hiding something.

export interface ApplyBarProps {
  intent: DesignIntent
  gate: ApplyGateResult
  applying: boolean
  error: string | null
  onApply: () => void
  onCalibrate: () => void
}

const KIND_STYLES: Record<string, string> = {
  pool: 'border-family-accent/40 bg-family-tint text-theme-fg',
  deck: 'border-theme-line bg-theme-card text-theme-fg',
  enclosure: 'border-theme-line bg-theme-card text-theme-fg',
  feature: 'border-theme-line bg-theme-bg text-theme-fg',
  site: 'border-theme-line bg-theme-card text-theme-muted',
}

export function ApplyBar({ intent, gate, applying, error, onApply, onCalibrate }: ApplyBarProps) {
  const items = summarizeApplyDiff(intent)
  const blocked = itemsBlockedByScale(intent, items)
  const blockedKeys = new Set(blocked.map((i) => i.key))

  return (
    <footer
      aria-label="Apply preview"
      className="border-t border-theme-line bg-theme-bg px-5 py-3"
    >
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-family-accent" aria-hidden />
            <h3 className="font-brandMono text-formLabel uppercase text-theme-muted">
              Applying creates
            </h3>
          </div>

          {items.length === 0 ? (
            <p className="mt-1.5 text-bodyS text-theme-muted">
              Nothing has been extracted yet, so there is nothing to create.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {items.map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-bodyS leading-none',
                    KIND_STYLES[item.kind] ?? 'border-theme-line bg-theme-bg',
                    blockedKeys.has(item.key) && 'border-dashed opacity-55 line-through',
                  )}
                >
                  {describeApplyDiffItem(item)}
                </li>
              ))}
            </ul>
          )}

          <p className="sr-only">{describeApplyDiff(items)}</p>

          {blocked.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-formLabel text-theme-fg">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-brand-orange" aria-hidden />
              <span>
                Struck-through items need a scale before they can be placed. Nothing else on this
                screen is blocked by it.
              </span>
            </p>
          ) : null}

          {error !== null ? (
            <p
              role="alert"
              className="mt-2 rounded-brand4 border border-brand-red/30 bg-tint-blush px-2 py-1.5 text-formLabel text-theme-fg"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex w-[280px] shrink-0 flex-col items-end gap-1.5">
          {gate.canApply ? null : <BlockReason gate={gate} onCalibrate={onCalibrate} />}
          <Button
            size="sm"
            onClick={onApply}
            disabled={!gate.canApply || applying}
            className="w-full"
          >
            {applying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Applying
              </>
            ) : (
              'Apply to project'
            )}
          </Button>
          <p className="text-right font-brandMono text-formLabel leading-tight text-theme-faint">
            One undoable action. Nothing is written until you press this.
          </p>
        </div>
      </div>
    </footer>
  )
}

function BlockReason({ gate, onCalibrate }: { gate: ApplyGateResult; onCalibrate: () => void }) {
  if (gate.reasons.includes('applied')) {
    return (
      <p className="text-right text-formLabel leading-tight text-theme-muted">
        This import has already been applied to the project.
      </p>
    )
  }

  if (gate.reasons.includes('empty')) {
    return (
      <p className="text-right text-formLabel leading-tight text-theme-muted">
        Analyze an image first: there is nothing extracted to apply.
      </p>
    )
  }

  if (gate.reasons.includes('scale')) {
    return (
      <div className="w-full rounded-brand4 border border-brand-orange/40 bg-tint-sand px-2 py-1.5 text-right">
        <p className="text-formLabel font-medium leading-tight text-theme-fg">
          Set the scale before applying.
        </p>
        <button
          type="button"
          onClick={onCalibrate}
          className="mt-1 inline-flex items-center gap-1 text-formLabel font-medium text-theme-fg underline underline-offset-2 hover:opacity-80"
        >
          <Ruler className="h-3 w-3" aria-hidden />
          Calibrate the image
        </button>
      </div>
    )
  }

  return (
    <p className="text-right text-formLabel leading-tight text-brand-red">
      {gate.unreviewed.length === 1
        ? '1 field needs your review'
        : `${gate.unreviewed.length} fields need your review`}
      : {summarise(gate.unreviewed)}.
    </p>
  )
}
