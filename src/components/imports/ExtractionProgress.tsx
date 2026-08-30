'use client'

import { AlertTriangle, Check, Info, Loader2, MinusCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ANALYSIS_STAGES,
  STAGE_DESCRIPTIONS,
  STAGE_LABELS,
  type AnalysisStageName,
  type SourceImageView,
  type StageState,
} from './types'

// Extraction is a slow model call, so this shows the stage ledger rather than
// a spinner: each row is a persisted `ImageAnalysis` row, which means the
// progress survives a reload and a failure names the stage that failed.

export interface ExtractionProgressProps {
  image: SourceImageView
  analyzing: boolean
  error: string | null
  onAnalyze: (force: boolean) => void
}

const STATE_STYLES: Record<StageState, string> = {
  PENDING: 'border-theme-line bg-theme-bg text-theme-faint',
  RUNNING: 'border-family-accent/40 bg-family-tint text-theme-fg',
  OK: 'border-brand-green/25 bg-tint-mint text-theme-fg',
  FAILED: 'border-brand-red/30 bg-tint-blush text-theme-fg',
  BLOCKED: 'border-brand-orange/30 bg-tint-sand text-theme-fg',
}

const STATE_WORDS: Record<StageState, string> = {
  PENDING: 'Not run',
  RUNNING: 'Running',
  OK: 'Done',
  FAILED: 'Failed',
  BLOCKED: 'Skipped',
}

export function stageCompletion(image: SourceImageView): {
  done: number
  total: number
  failedStage: AnalysisStageName | null
  skipped: number
} {
  let done = 0
  let skipped = 0
  let failedStage: AnalysisStageName | null = null
  for (const stage of ANALYSIS_STAGES) {
    const view = image.stages[stage]
    if (view.status === 'OK') done += 1
    if (view.status === 'BLOCKED') skipped += 1
    if (view.status === 'FAILED' && failedStage === null) failedStage = stage
  }
  return { done, total: ANALYSIS_STAGES.length, failedStage, skipped }
}

/**
 * What the analyse button says.
 *
 * It used to read "Re-analyze" the moment any stage had completed, which after
 * a run that gave up at Classify announced a finished job over an empty
 * extraction. Completion is all stages, and nothing less is allowed to sound
 * like it.
 */
export function analyzeButtonLabel(args: {
  analyzing: boolean
  complete: boolean
  stopped: boolean
  started: boolean
}): string {
  if (args.analyzing) return 'Analyzing'
  if (args.complete) return 'Re-analyze'
  if (args.stopped) return 'Try again'
  if (args.started) return 'Finish analysis'
  return 'Analyze image'
}

export function ExtractionProgress({
  image,
  analyzing,
  error,
  onAnalyze,
}: ExtractionProgressProps) {
  const { done, total, failedStage, skipped } = stageCompletion(image)
  const complete = done === total
  const started = done > 0 || failedStage !== null
  const stopped = image.blocked !== null || failedStage !== null

  return (
    <section
      aria-label={`Extraction progress for ${image.label}`}
      className="border-b border-theme-lineSoft bg-theme-bg px-4 py-2.5"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="font-brandMono text-formLabel uppercase text-theme-muted">Extraction</h3>
          <span className="text-formLabel tabular-nums text-theme-faint">
            {done} of {total} stages
            {skipped > 0 ? (
              <span className="text-theme-fg">
                {' · stopped after '}
                {STAGE_LABELS[image.blocked?.afterStage ?? 'CLASSIFY']}
              </span>
            ) : null}
          </span>
        </div>

        <ol className="flex flex-1 items-center gap-1.5">
          {ANALYSIS_STAGES.map((stage) => {
            const view = image.stages[stage]
            // A re-run clears a previous stop, so a skipped stage spins too:
            // leaving it greyed out while the model is being called again reads
            // as "still not being attempted".
            const status: StageState =
              analyzing && (view.status === 'PENDING' || view.status === 'BLOCKED')
                ? 'RUNNING'
                : view.status
            return (
              <li key={stage} className="min-w-0 flex-1">
                <div
                  title={STAGE_DESCRIPTIONS[stage]}
                  className={cn(
                    'flex items-center gap-1.5 rounded-brand4 border px-2 py-1',
                    STATE_STYLES[status],
                  )}
                >
                  {status === 'OK' ? (
                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                  ) : status === 'RUNNING' ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                  ) : status === 'FAILED' ? (
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  ) : status === 'BLOCKED' ? (
                    <MinusCircle className="h-3 w-3 shrink-0" aria-hidden />
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                  )}
                  <span className="truncate text-bodyS font-medium">{STAGE_LABELS[stage]}</span>
                  <span className="ml-auto font-brandMono text-formLabel uppercase tracking-wide opacity-80">
                    {STATE_WORDS[status]}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>

        <Button
          size="sm"
          variant={complete ? 'outline' : 'default'}
          onClick={() => onAnalyze(complete || stopped)}
          disabled={analyzing}
        >
          {analyzing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {analyzeButtonLabel({ analyzing, complete, stopped, started })}
        </Button>
      </div>

      {image.blocked !== null ? (
        <div
          role="status"
          className="mt-2 rounded-brand4 border border-brand-orange/30 bg-tint-sand px-2.5 py-2 text-bodyS text-theme-fg"
        >
          <p className="flex gap-1.5">
            <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{image.blocked.headline}</span>{' '}
              {image.blocked.detail}
            </span>
          </p>
        </div>
      ) : null}

      {failedStage !== null || error !== null ? (
        <div
          role="alert"
          className="mt-2 rounded-brand4 border border-brand-red/25 bg-tint-blush px-2.5 py-2 text-bodyS text-theme-fg"
        >
          {failedStage !== null ? (
            <p>
              <span className="font-semibold">{STAGE_LABELS[failedStage]} failed.</span> Retrying
              re-runs that stage only, because completed stages are cached on the image and the
              extractor version. If it fails again, the image is likely too low resolution or too
              oblique to read.
              {image.stages[failedStage].errorRef === null ? null : (
                <span className="ml-1 text-brand-red">
                  Support reference {image.stages[failedStage].errorRef}.
                </span>
              )}
            </p>
          ) : null}
          {error !== null ? <p className={failedStage === null ? '' : 'mt-1'}>{error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

export interface SourceImageTabsProps {
  images: SourceImageView[]
  activeId: string
  onSelect: (id: string) => void
}

export function SourceImageTabs({ images, activeId, onSelect }: SourceImageTabsProps) {
  if (images.length <= 1) return null
  return (
    <div
      role="tablist"
      aria-label="Source images"
      className="flex items-center gap-1 border-b border-theme-lineSoft bg-theme-bg px-4 py-1.5"
    >
      {images.map((image) => {
        const { done, total, failedStage } = stageCompletion(image)
        const stoppedEarly = image.blocked !== null
        const active = image.id === activeId
        return (
          <button
            key={image.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onSelect(image.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-brand4 px-2.5 py-1 text-bodyS transition-colors duration-brand ease-brand',
              active
                ? 'bg-family-tint font-medium text-theme-fg'
                : 'text-theme-muted hover:bg-theme-card hover:text-theme-fg',
            )}
          >
            <span>{image.label}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-formLabel tabular-nums',
                failedStage !== null
                  ? 'bg-tint-blush text-theme-fg'
                  : stoppedEarly
                    ? 'bg-tint-sand text-theme-fg'
                    : done === total
                      ? 'bg-tint-mint text-theme-fg'
                      : 'bg-theme-card text-theme-faint',
              )}
            >
              {done}/{total}
            </span>
          </button>
        )
      })}
    </div>
  )
}
