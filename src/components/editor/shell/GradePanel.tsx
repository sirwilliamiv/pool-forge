'use client'

import { AlertTriangle, Mountain, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

import { dispatch } from '@/lib/commands/dispatch'
import { cutFillBetween, maxSlope, nextShotPosition, type SiteGrade } from '@/modules/editor/grade/model'
import { visibleBounds } from '@/modules/editor/placement'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

// Site elevations, by hand.
//
// The voice agent drives the same commands, so this is not a second way of doing
// it: both go through the registry, and anything typed here is auditable exactly
// like anything spoken.

const DEFAULT_BOUNDS = { x: -600, y: -600, width: 1_200, height: 1_200 }

export function GradePanel() {
  const existing = useGradeStore(s => s.existing)
  const finished = useGradeStore(s => s.finished)
  const editing = useGradeStore(s => s.editing)
  const setEditing = useGradeStore(s => s.setEditing)
  const shapes = useShapesStore(s => s.shapes)

  const bounds = useMemo(() => visibleBounds(shapes) ?? DEFAULT_BOUNDS, [shapes])
  const earthwork = useMemo(
    () => cutFillBetween(existing, finished, bounds),
    [existing, finished, bounds],
  )
  const slopePct = useMemo(
    () => Math.round(maxSlope(finished.enabled ? finished : existing, bounds) * 1000) / 10,
    [existing, finished, bounds],
  )

  const surface = editing === 'finished' ? finished : existing
  const enabled = existing.enabled || finished.enabled

  function addPoint() {
    const spot = nextShotPosition(surface.points.length, bounds)
    void dispatch('grade.point.add', {
      surface: editing,
      xFt: Math.round(spot.x / 12),
      yFt: Math.round(spot.y / 12),
      // At the datum, which is the benchmark everything on site is shot from.
      // A new shot at a hardcoded zero meant that on a site benchmarked at 12
      // feet, pressing Add dropped the ground twelve feet.
      elevationFt: surface.baseElevationFt,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Mountain className="h-3.5 w-3.5" aria-hidden />
          Site grading
        </span>
        <label className="flex items-center gap-1.5 text-textMuted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => void dispatch('grade.enable', { enabled: e.target.checked })}
          />
          On
        </label>
      </div>

      {!enabled && (
        <p className="text-[11.5px] text-textFaint">
          The site is flat. Turn grading on to record how the ground falls, and what has to move.
        </p>
      )}

      {enabled && (
        <>
          {/* Two surfaces, never one. Netting them would make the earthwork
              unrecoverable, and the earthwork is what gets quoted. */}
          <div className="flex gap-1">
            {(['existing', 'finished'] as const).map(which => (
              <button
                key={which}
                type="button"
                onClick={() => setEditing(which)}
                className={
                  'flex-1 rounded-pfSm px-2 py-1 text-[11.5px] transition ' +
                  (editing === which
                    ? 'bg-foreground text-white'
                    : 'text-textMuted hover:bg-rowHover hover:text-foreground')
                }
              >
                {which === 'existing' ? 'Existing ground' : 'Finished grade'}
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between gap-2">
            <span className="text-textMuted">Datum (ft)</span>
            <input
              type="number"
              step="0.25"
              value={surface.baseElevationFt}
              onChange={e =>
                void dispatch('grade.base.set', {
                  surface: editing,
                  elevationFt: Number(e.target.value) || 0,
                })
              }
              className="w-20 rounded-pfSm border border-border px-1.5 py-0.5 text-right"
            />
          </label>

          <div className="flex items-center justify-between">
            <span className="text-textMuted">
              {surface.points.length} elevation{surface.points.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={addPoint}
              className="flex items-center gap-1 rounded-pfSm px-1.5 py-0.5 text-textMuted hover:bg-rowHover hover:text-foreground"
            >
              <Plus className="h-3 w-3" aria-hidden />
              Add
            </button>
          </div>

          <ul className="flex flex-col gap-1">
            {surface.points.map(point => (
              <li key={point.id} className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.25"
                  value={point.elevationFt}
                  onChange={e =>
                    void dispatch('grade.point.update', {
                      surface: editing,
                      pointId: point.id,
                      elevationFt: Number(e.target.value) || 0,
                    })
                  }
                  aria-label={`Elevation of ${point.label ?? point.id}`}
                  className="w-16 rounded-pfSm border border-border px-1.5 py-0.5 text-right"
                />
                <span className="text-textFaint">ft</span>
                <input
                  value={point.label ?? ''}
                  placeholder="where"
                  onChange={e =>
                    void dispatch('grade.point.update', {
                      surface: editing,
                      pointId: point.id,
                      label: e.target.value,
                    })
                  }
                  aria-label={`Label for ${point.id}`}
                  className="min-w-0 flex-1 rounded-pfSm border border-border px-1.5 py-0.5"
                />
                <button
                  type="button"
                  onClick={() =>
                    void dispatch('grade.point.remove', { surface: editing, pointId: point.id })
                  }
                  aria-label={`Remove elevation ${point.label ?? point.id}`}
                  className="rounded-pfSm p-1 text-textMuted hover:bg-rowHover hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-1 border-t border-borderLight pt-2">
            {/* Cut and fill apart, never a single net figure: a yard out is
                haulage and a yard in is material. */}
            <Row label="Cut" value={`${earthwork.cutYards} yd³`} />
            <Row label="Fill" value={`${earthwork.fillYards} yd³`} />
            <Row label="Fall across site" value={`${earthwork.reliefFt} ft`} />
            <Row label="Steepest slope" value={`${slopePct}%`} />
            {/* The provenance of the two numbers above. A cut and fill taken
                across ground nobody walked is an estimate, and it has to say so
                in the same box it is printed in, not somewhere else. */}
            <GroundProvenance existing={existing} />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Where the ground under the earthwork came from.
 *
 * Three cases, and only two of them say anything. A site walked with a phone
 * reports how much of it was actually measured. A site with no shots at all is
 * an assumption of flat ground, and pretending otherwise is how a dig gets
 * quoted off a surface nobody ever looked at. A site the builder shot by hand
 * gets no notice: those are real measurements, taken by the person signing the
 * contract, and a warning on every one of them is a warning nobody reads.
 */
function GroundProvenance({ existing }: { existing: SiteGrade }) {
  const capture = existing.capture

  if (!capture) {
    if (existing.points.length > 0) return null
    return (
      <p className="mt-2 text-[11px] leading-snug text-textFaint">
        No elevations have been recorded and nobody has walked the site, so this assumes flat
        ground at the datum.
      </p>
    )
  }

  const walked = Math.round(capture.measuredFraction * 100)
  const complete = capture.gapAreaSqft <= 0

  return (
    <div className="mt-2">
      <Row label="Ground walked" value={complete ? 'All of it' : `${walked}%`} />
      {!complete && (
        <div className="mt-1 rounded-pfSm border border-amber-200 bg-amber-50 px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            Interpolated across unwalked ground
          </div>
          <p className="mt-1 text-[11px] leading-snug text-amber-900">
            {100 - walked}% of the captured area was never walked (
            {Math.round(capture.gapAreaSqft).toLocaleString()} sq ft
            {capture.largestGapSqft >= 4 && capture.largestGapSqft < capture.gapAreaSqft * 0.95
              ? `, the largest hole ${Math.round(capture.largestGapSqft).toLocaleString()} sq ft`
              : ''}
            ). The ground there is interpolated from what surrounds it, so the cut and fill over it
            is an estimate.
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-textMuted">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  )
}
