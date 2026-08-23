'use client'

import { Ruler, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

import { dispatch } from '@/lib/commands/dispatch'
import { formatFtIn, formatSignedFtIn } from '@/modules/measurements/engine'
import {
  siteSetbackReport,
  suggestedLot,
  type LotEdge,
} from '@/modules/editor/site/model'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'

// The lot, by hand.
//
// Everything here dispatches through the registry, so a property line dragged
// into place by a builder and one placed by the voice agent are the same event
// with the same audit row. Nothing in this panel writes to the store directly.

const EDGE_LABEL: Record<LotEdge, string> = {
  front: 'Front',
  rear: 'Rear',
  left: 'Left side',
  right: 'Right side',
}

function ftOf(inches: number): number {
  return Math.round((inches / 12) * 10) / 10
}

export function SitePanel() {
  const shapes = useShapesStore(s => s.shapes)
  const select = useSelectionStore(s => s.select)
  const report = useMemo(() => siteSetbackReport(shapes), [shapes])
  const lot = report.lot
  const limits = lot?.limits ?? {}

  function placeLot() {
    const suggestion = suggestedLot(shapes)
    void dispatch('site.property.place', {
      widthFt: ftOf(suggestion.width),
      depthFt: ftOf(suggestion.height),
      xFt: ftOf(suggestion.x),
      yFt: ftOf(suggestion.y),
    })
  }

  function resizeLot(patch: { widthFt?: number; depthFt?: number }) {
    if (!lot) return
    void dispatch('site.property.place', {
      widthFt: patch.widthFt ?? ftOf(lot.width),
      depthFt: patch.depthFt ?? ftOf(lot.height),
      xFt: ftOf(lot.x),
      yFt: ftOf(lot.y),
    })
  }

  function placeHouse() {
    // Along the front of whatever is drawn, twenty feet clear of it — a
    // starting position to be dragged onto the survey, not a claim.
    const box = suggestedLot(shapes)
    // A house-sized house. Sixty per cent of the site box put a 137 ft wall on
    // a wide drawing, which is a warehouse.
    const widthFt = Math.min(60, Math.max(24, Math.round((box.width / 12) * 0.35)))
    void dispatch('site.structure.place', {
      label: 'House',
      widthFt,
      depthFt: 24,
      xFt: Math.round(box.x / 12 + (box.width / 12 - widthFt) / 2),
      yFt: Math.round(box.y / 12) - 24,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Ruler className="h-3.5 w-3.5" aria-hidden />
          Site &amp; setbacks
        </span>
      </div>

      {!lot ? (
        <>
          <p className="text-[11.5px] text-textFaint">
            No property line has been drawn, so no setback can be measured and the site plan says
            so. Draw the lot, then drag its edges onto the survey.
          </p>
          <button
            type="button"
            onClick={placeLot}
            className="rounded-pfSm bg-foreground px-2 py-1 text-[11.5px] font-medium text-white"
          >
            Draw property line
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-textMuted">Lot width (ft)</span>
              <input
                type="number"
                step="1"
                min="1"
                defaultValue={ftOf(lot.width)}
                key={`w-${lot.id}-${lot.width}`}
                onBlur={e => {
                  const value = Number(e.target.value)
                  if (Number.isFinite(value) && value > 0 && value !== ftOf(lot.width)) {
                    resizeLot({ widthFt: value })
                  }
                }}
                className="rounded-pfSm border border-border px-1.5 py-0.5 text-right"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-textMuted">Lot depth (ft)</span>
              <input
                type="number"
                step="1"
                min="1"
                key={`d-${lot.id}-${lot.height}`}
                defaultValue={ftOf(lot.height)}
                onBlur={e => {
                  const value = Number(e.target.value)
                  if (Number.isFinite(value) && value > 0 && value !== ftOf(lot.height)) {
                    resizeLot({ depthFt: value })
                  }
                }}
                className="rounded-pfSm border border-border px-1.5 py-0.5 text-right"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => select(lot.id)}
              className="flex-1 rounded-pfSm border border-border px-2 py-1 text-[11.5px] text-foreground hover:bg-rowHover"
            >
              Select on canvas
            </button>
            <button
              type="button"
              aria-label="Remove property line"
              onClick={() => void dispatch('site.property.remove', {})}
              className="grid h-7 w-7 place-items-center rounded-pfSm border border-border text-textMuted hover:bg-rowHover hover:text-pfError"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <div className="border-t border-borderLight pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
              Required setbacks (ft)
            </div>
            <p className="mb-1.5 text-[11px] text-textFaint">
              What this jurisdiction requires. Left blank, the permit sheet prints “not entered”
              rather than a number nobody checked.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['frontFt', 'Front'],
                  ['sideFt', 'Side'],
                  ['rearFt', 'Rear'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-0.5">
                  <span className="text-textMuted">{label}</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="—"
                    key={`${key}-${limits[key] ?? ''}`}
                    defaultValue={limits[key] ?? ''}
                    onBlur={e => {
                      const raw = e.target.value.trim()
                      if (raw === '') return
                      const value = Number(raw)
                      if (!Number.isFinite(value) || value < 0 || value === limits[key]) return
                      void dispatch('site.limits.set', { [key]: value })
                    }}
                    className="rounded-pfSm border border-border px-1.5 py-0.5 text-right"
                  />
                </label>
              ))}
            </div>
            <label className="mt-2 flex flex-col gap-0.5">
              <span className="text-textMuted">Easements</span>
              <input
                type="text"
                placeholder="None of record"
                key={`easements-${limits.easements ?? ''}`}
                defaultValue={limits.easements ?? ''}
                onBlur={e => {
                  const value = e.target.value.trim()
                  if (value === (limits.easements ?? '')) return
                  void dispatch('site.limits.set', { easements: value })
                }}
                className="rounded-pfSm border border-border px-1.5 py-0.5"
              />
            </label>
          </div>
        </>
      )}

      <div className="border-t border-borderLight pt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
            Structures
          </span>
          <button
            type="button"
            onClick={placeHouse}
            className="rounded-pfSm border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-rowHover"
          >
            Place house
          </button>
        </div>
        {report.structures.length === 0 ? (
          <p className="text-[11px] text-textFaint">
            Nothing placed. “From house” reads as not measured until a structure is on the drawing.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {report.structures.map(structure => (
              <li key={structure.id} className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => select(structure.id)}
                  className="text-left text-foreground hover:underline"
                >
                  {structure.label}
                </button>
                <span className="tabular-nums text-textMuted">
                  {Math.round(structure.width / 12)}′ × {Math.round(structure.height / 12)}′
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-borderLight pt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
          Measured
        </div>
        {!report.edges ? (
          <p className="text-[11px] text-textFaint">
            {lot
              ? 'No pool or spa on the drawing to measure.'
              : 'Nothing to measure until the property line is drawn.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {report.edges.map(edge => (
              <li key={edge.edge} className="flex items-baseline justify-between">
                <span className="text-textFaint">{EDGE_LABEL[edge.edge]}</span>
                <span
                  className={
                    edge.compliant === false ? 'tabular-nums text-pfError' : 'tabular-nums text-foreground'
                  }
                >
                  {formatSignedFtIn(edge.distanceIn)}
                  {edge.requiredIn === null ? '' : ` / req. ${formatFtIn(edge.requiredIn)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {report.toStructureIn !== null ? (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-textFaint">To {report.nearestStructureLabel}</span>
            <span className="tabular-nums text-foreground">{formatFtIn(report.toStructureIn)}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
