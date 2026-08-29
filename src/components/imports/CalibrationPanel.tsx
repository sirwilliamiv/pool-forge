'use client'

import { Check, Loader2, Ruler, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DesignIntent, ScaleMethod } from '@/modules/imports/intent'
import {
  calibrationPxDistance,
  parseRealDistanceInches,
  pixelsPerInchFrom,
  type CalibrationPoint,
} from './overlay-geometry'

// Gate 1. A null `scale.pixelsPerInch` means there is no honest way to turn a
// polygon into feet, so the screen says that in words and hands over the
// two-point tool, rather than greying out Apply and leaving the user to guess.
//
// Two-point calibration has the same semantics as `calibrationPxDistance` and
// `calibrationRealInches` in `surveyStore`: mark a span whose real length is
// known, and the ratio is the scale.

const METHOD_LABELS: Record<ScaleMethod, string> = {
  grid: 'detected grid pitch',
  'labeled-dimension': 'a labeled dimension',
  'scale-bar': 'a scale bar',
  manual: 'your two-point calibration',
}

export interface CalibrationPanelProps {
  intent: DesignIntent
  calibrating: boolean
  points: CalibrationPoint[]
  distanceText: string
  saving: boolean
  error: string | null
  disabled: boolean
  onStart: () => void
  onCancel: () => void
  onResetPoints: () => void
  onDistanceChange: (value: string) => void
  onSubmit: (pixelsPerInch: number) => void
}

export function CalibrationPanel({
  intent,
  calibrating,
  points,
  distanceText,
  saving,
  error,
  disabled,
  onStart,
  onCancel,
  onResetPoints,
  onDistanceChange,
  onSubmit,
}: CalibrationPanelProps) {
  const ppi = intent.scale.pixelsPerInch
  const a = points[0]
  const b = points[1]
  const pxDistance = a && b ? calibrationPxDistance(a, b) : null
  const realInches = parseRealDistanceInches(distanceText)
  const candidate =
    pxDistance === null || realInches === null ? null : pixelsPerInchFrom(pxDistance, realInches)

  if (!calibrating) {
    if (ppi === null) {
      return (
        <div className="border-b border-pfError/25 bg-errorSoft px-4 py-3">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <h3 className="text-[12px] font-semibold text-red-900">
                This image has no scale, so no geometry can be applied.
              </h3>
              <p className="mt-0.5 text-[11px] leading-snug text-red-800">
                No grid pitch, labeled dimension, or scale bar was resolved. Until a scale exists,
                every footprint and every dimension derived from one stays out of the project.
                Mark two points you know the real distance between and the rest follows.
              </p>
            </div>
            <Button size="sm" onClick={onStart} disabled={disabled}>
              <Ruler className="h-3.5 w-3.5" aria-hidden />
              Calibrate
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-3 border-b border-borderLight bg-white px-4 py-2">
        <Ruler className="h-3.5 w-3.5 shrink-0 text-pfAccentStrong" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-foreground">
            <span className="font-semibold tabular-nums">{ppi.toFixed(2)} px</span> per inch
            <span className="text-textMuted">
              {intent.scale.method === null
                ? ''
                : `, from ${METHOD_LABELS[intent.scale.method]}`}
            </span>
          </p>
          <p className="text-[10.5px] text-textMuted">
            One foot on the image measures {(ppi * 12).toFixed(1)} pixels. Turn on the derived grid
            to check it against the paper.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-textFaint tabular-nums">
          {Math.round(intent.scale.confidence * 100)}% confidence
        </span>
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          className="text-[11px] font-medium text-pfAccentStrong underline underline-offset-2 hover:text-sky-800 disabled:opacity-50"
        >
          Recalibrate
        </button>
      </div>
    )
  }

  const step = points.length === 0 ? 1 : points.length === 1 ? 2 : 3

  return (
    <div className="border-b border-pfAccent/30 bg-pfAccentSoft px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-sky-950">
            <Ruler className="h-3.5 w-3.5" aria-hidden />
            Two-point calibration
          </h3>
          <ol className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <CalibrationStep index={1} active={step === 1} done={step > 1}>
              Click the first point on the image
            </CalibrationStep>
            <CalibrationStep index={2} active={step === 2} done={step > 2}>
              Click the second point
            </CalibrationStep>
            <CalibrationStep index={3} active={step === 3} done={false}>
              Type the real distance between them
            </CalibrationStep>
          </ol>

          {pxDistance !== null ? (
            <p className="mt-2 text-[11px] text-sky-900">
              Marked span measures{' '}
              <span className="font-semibold tabular-nums">{Math.round(pxDistance)} px</span>.
            </p>
          ) : null}

          {error !== null ? (
            <p role="alert" className="mt-2 text-[11px] font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex w-[300px] shrink-0 flex-col gap-1.5">
          <label className="flex items-center gap-2 rounded-pfXs border border-sky-300 bg-white px-2 focus-within:ring-2 focus-within:ring-pfAccent">
            <span className="text-[10px] uppercase tracking-wider text-textFaint">Real</span>
            <input
              type="text"
              inputMode="decimal"
              value={distanceText}
              disabled={step < 3 || disabled}
              placeholder="e.g. 20, or 20 ft 6 in"
              aria-label="Real world distance between the two points"
              onChange={(e) => onDistanceChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && candidate !== null) onSubmit(candidate)
              }}
              className="w-full bg-transparent py-1.5 text-right text-[12px] tabular-nums outline-none disabled:opacity-50"
            />
          </label>

          <p className="text-right text-[10.5px] text-sky-900">
            {candidate === null ? (
              step < 3 ? (
                'Mark both points to continue.'
              ) : (
                'Enter a distance in feet.'
              )
            ) : (
              <>
                Sets the scale to{' '}
                <span className="font-semibold tabular-nums">{candidate.toFixed(2)} px</span> per
                inch.
              </>
            )}
          </p>

          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetPoints}
              disabled={points.length === 0 || disabled}
            >
              Clear points
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (candidate !== null) onSubmit(candidate)
              }}
              disabled={candidate === null || saving || disabled}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
              Set scale
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CalibrationStep({
  index,
  active,
  done,
  children,
}: {
  index: number
  active: boolean
  done: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold',
          done
            ? 'bg-emerald-600 text-white'
            : active
              ? 'bg-pfAccentStrong text-white'
              : 'bg-white text-textFaint',
        )}
      >
        {done ? <Check className="h-2.5 w-2.5" aria-hidden /> : index}
      </span>
      <span className={cn(active ? 'font-medium text-sky-950' : 'text-sky-900/70')}>
        {children}
      </span>
    </li>
  )
}
