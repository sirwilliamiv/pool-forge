'use client'

import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react'
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
  PENDING: 'border-border bg-white text-textFaint',
  RUNNING: 'border-pfAccent/40 bg-pfAccentSoft text-sky-900',
  OK: 'border-emerald-600/25 bg-emerald-50 text-emerald-800',
  FAILED: 'border-pfError/30 bg-errorSoft text-red-800',
}

const STATE_WORDS: Record<StageState, string> = {
  PENDING: 'Not run',
  RUNNING: 'Running',
  OK: 'Done',
  FAILED: 'Failed',
}

export function stageCompletion(image: SourceImageView): {
  done: number
  total: number
  failedStage: AnalysisStageName | null
} {
  let done = 0
  let failedStage: AnalysisStageName | null = null
  for (const stage of ANALYSIS_STAGES) {
    const view = image.stages[stage]
    if (view.status === 'OK') done += 1
    if (view.status === 'FAILED' && failedStage === null) failedStage = stage
  }
  return { done, total: ANALYSIS_STAGES.length, failedStage }
}

export function ExtractionProgress({
  image,
  analyzing,
  error,
  onAnalyze,
}: ExtractionProgressProps) {
  const { done, total, failedStage } = stageCompletion(image)
  const complete = done === total
  const started = done > 0 || failedStage !== null

  return (
    <section
      aria-label={`Extraction progress for ${image.label}`}
      className="border-b border-borderLight bg-white px-4 py-2.5"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">
            Extraction
          </h3>
          <span className="text-[10.5px] tabular-nums text-textFaint">
            {done} of {total} stages
          </span>
        </div>

        <ol className="flex flex-1 items-center gap-1.5">
          {ANALYSIS_STAGES.map((stage) => {
            const view = image.stages[stage]
            const status: StageState =
              analyzing && view.status === 'PENDING' ? 'RUNNING' : view.status
            return (
              <li key={stage} className="min-w-0 flex-1">
                <div
                  title={STAGE_DESCRIPTIONS[stage]}
                  className={cn(
                    'flex items-center gap-1.5 rounded-pfXs border px-2 py-1',
                    STATE_STYLES[status],
                  )}
                >
                  {status === 'OK' ? (
                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                  ) : status === 'RUNNING' ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                  ) : status === 'FAILED' ? (
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                  )}
                  <span className="truncate text-[11px] font-medium">{STAGE_LABELS[stage]}</span>
                  <span className="ml-auto text-[9.5px] uppercase tracking-wide opacity-80">
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
          onClick={() => onAnalyze(complete)}
          disabled={analyzing}
        >
          {analyzing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {analyzing ? 'Analyzing' : started ? 'Re-analyze' : 'Analyze image'}
        </Button>
      </div>

      {failedStage !== null || error !== null ? (
        <div
          role="alert"
          className="mt-2 rounded-pfXs border border-pfError/25 bg-errorSoft px-2.5 py-2 text-[11px] text-red-800"
        >
          {failedStage !== null ? (
            <p>
              <span className="font-semibold">{STAGE_LABELS[failedStage]} failed.</span> Retrying
              re-runs that stage only, because completed stages are cached on the image and the
              extractor version. If it fails again, the image is likely too low resolution or too
              oblique to read.
              {image.stages[failedStage].errorRef === null ? null : (
                <span className="ml-1 text-red-700">
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
      className="flex items-center gap-1 border-b border-borderLight bg-white px-4 py-1.5"
    >
      {images.map((image) => {
        const { done, total, failedStage } = stageCompletion(image)
        const active = image.id === activeId
        return (
          <button
            key={image.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onSelect(image.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-pfXs px-2.5 py-1 text-[11.5px] transition-colors',
              active
                ? 'bg-rowActive font-medium text-sky-950'
                : 'text-textMuted hover:bg-rowHover hover:text-foreground',
            )}
          >
            <span>{image.label}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-[9.5px] tabular-nums',
                failedStage !== null
                  ? 'bg-errorSoft text-red-700'
                  : done === total
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rowHover text-textFaint',
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
