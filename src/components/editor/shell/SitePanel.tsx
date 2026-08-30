'use client'

import Link from 'next/link'
import { Ruler, Satellite, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { dispatch } from '@/lib/commands/dispatch'
import { formatFtIn, formatSignedFtIn } from '@/modules/measurements/engine'
import { loadDrawing } from '@/modules/editor/persistence'
import {
  siteSetbackReport,
  suggestedLot,
  type LotEdge,
} from '@/modules/editor/site/model'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useSurveyStore } from '@/modules/editor/state/surveyStore'

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

type ImportKind = 'satellite' | 'building'

/**
 * Import the property from its address.
 *
 * Two buttons, two commands, both through the registry: the satellite
 * backdrop resolves on the client (its handler writes the survey store), while
 * the building appends a shape to the drawing server-side, after which the
 * shape store is reloaded from the row so the canvas and the database agree.
 * Missing capability (maps off, Solar knows nothing here) comes back as a
 * typed refusal; its message is rendered rather than swallowed. Property
 * lines are hand-drawn below; there is no parcel data provider.
 */
function SiteImportSection({
  projectId,
  site,
}: {
  projectId: string
  site: { locationSet: boolean; address: string | null }
}) {
  const [busy, setBusy] = useState<ImportKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const disabled = !site.locationSet || busy !== null

  async function run(kind: ImportKind) {
    setBusy(kind)
    setError(null)
    const commandId =
      kind === 'satellite' ? 'site.import.satellite' : 'site.import.building'
    const result = await dispatch(commandId, { projectId })
    if (!result.ok) {
      setError(result.error)
      setBusy(null)
      return
    }

    if (kind === 'building') {
      // A shape was appended to the drawing server-side. Reload from the row,
      // same as the drawing import flow does, so the store matches what was
      // written and the next autosave cannot write the appended shape away.
      try {
        const fresh = await loadDrawing(projectId)
        useShapesStore.getState().hydrate(fresh.shapes)
        // The server recorded which shape it placed in
        // `survey.importedBuildingShapeId`. The open editor's survey store
        // autosaves over `rootJson.survey`, so the id has to land in the store
        // too or the next autosave erases it and a re-import stacks a second
        // house. The rest of the store's survey stays as it is: it may hold a
        // backdrop newer than what the row has saved yet.
        const importedId = fresh.survey?.importedBuildingShapeId
        const surveyStore = useSurveyStore.getState()
        if (importedId !== undefined) {
          if (surveyStore.survey) {
            surveyStore.patchSurvey({ importedBuildingShapeId: importedId })
          } else {
            surveyStore.setSurvey(fresh.survey ?? null)
          }
        }
      } catch {
        setError('Imported, but the canvas could not reload. Refresh the page to see it.')
        setBusy(null)
        return
      }
    }

    setBusy(null)
  }

  return (
    <div className="border-b border-borderLight pb-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
        <Satellite className="h-3 w-3" aria-hidden />
        Import site
      </div>

      {!site.locationSet ? (
        <p className="mb-1.5 text-[11px] text-textFaint">
          No site location on this project yet. Set the address on the{' '}
          <Link href={`/projects/${projectId}`} className="text-foreground underline">
            project page
          </Link>{' '}
          to import the property.
        </p>
      ) : (
        <p className="mb-1.5 text-[11px] text-textFaint">
          {site.address ?? 'Site located.'}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void run('satellite')}
          className="rounded-pfSm bg-foreground px-2 py-1 text-[11.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'satellite' ? 'Importing backdrop…' : 'Satellite backdrop'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void run('building')}
          className="rounded-pfSm border border-border px-2 py-1 text-[11.5px] text-foreground hover:bg-rowHover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'building' ? 'Importing building…' : 'Building footprint'}
        </button>
      </div>

      {error ? <p className="mt-1.5 text-[11px] text-pfError">{error}</p> : null}

      <BackdropOpacity />
    </div>
  )
}

/**
 * The backdrop's opacity, as a slider.
 *
 * Dragging previews by writing the survey store directly, the same live
 * manipulation contract as dragging a shape; releasing commits the value
 * through `site.survey.opacity`, so the audit log and the voice agent see one
 * event per adjustment rather than sixty per second of thumb travel.
 */
function BackdropOpacity() {
  const survey = useSurveyStore(s => s.survey)
  if (!survey?.geo) return null

  const percent = Math.round(survey.opacity * 100)

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
        <span>Backdrop opacity</span>
        <span className="font-mono tabular-nums">{percent}%</span>
      </div>
      <input
        type="range"
        min={5}
        max={100}
        value={percent}
        aria-label="Backdrop opacity"
        className="mt-1 h-2 w-full cursor-pointer accent-foreground"
        onChange={e => {
          const store = useSurveyStore.getState()
          const current = store.survey
          if (!current) return
          store.setSurvey({ ...current, opacity: Number(e.target.value) / 100 })
        }}
        onPointerUp={e => {
          void dispatch('site.survey.opacity', {
            opacity: Number((e.target as HTMLInputElement).value) / 100,
          })
        }}
      />
    </div>
  )
}

export interface SitePanelProps {
  projectId: string
  site: { locationSet: boolean; address: string | null }
}

export function SitePanel({ projectId, site }: SitePanelProps) {
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

      <SiteImportSection projectId={projectId} site={site} />

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
