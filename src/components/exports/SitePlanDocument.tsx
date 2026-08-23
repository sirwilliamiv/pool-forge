import { formatFtIn, formatSignedFtIn, type MeasurementSummary } from '@/modules/measurements/engine'
import { siteSetbackReport, type EdgeSetback, type LotEdge } from '@/modules/editor/site/model'
import type { Shape } from '@/modules/editor/state/shapes'
import { PlanLegend } from './PlanLegend'
import { TechnicalPlanSvg } from './TechnicalPlanSvg'

interface CustomerLite {
  name: string
  email: string | null
  phone: string | null
  address: string | null
}

interface ProjectLite {
  id: string
  name: string
  salesperson: string | null
  designer: string | null
  internalNotes: string | null
  poolFields: unknown
  createdAt: Date
}

interface PoolFields {
  poolType?: string
  accessNotes?: string
}

export interface SitePlanDocumentProps {
  project: ProjectLite
  customer: CustomerLite | null
  shapes: Shape[]
  measurements: MeasurementSummary
  /** Path or data URL of the survey image overlay (PDF rasterized → PNG). */
  surveyImageUrl?: string | null
  /** Permit / municipality info for the title block. */
  jurisdiction?: string | null
  /** Optional parcel ID printed in the title block. */
  parcelId?: string | null
}

/** The printed size of the plan box on a letter sheet, in inches. */
const PLAN_BOX = { widthIn: 7.4, heightIn: 5.4 }

const EDGE_LABEL: Record<LotEdge, string> = {
  front: 'Front',
  rear: 'Rear',
  left: 'Left side',
  right: 'Right side',
}

function formatNum(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * What is printed where a value has not been supplied.
 *
 * A bare em dash reads as a formatting placeholder, and a plan checker cannot
 * tell it apart from a field the software failed to fill. Saying it in words
 * costs nothing and cannot be misread.
 */
function orNotEntered(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return 'Not entered'
  return String(value)
}

export function SitePlanDocument(props: SitePlanDocumentProps) {
  const { project, customer, shapes, measurements: m, surveyImageUrl, jurisdiction, parcelId } = props
  const pf = (project.poolFields ?? {}) as PoolFields
  const report = siteSetbackReport(shapes)
  const lot = report.lot
  const limits = lot?.limits ?? {}
  const hasAnyLimit =
    limits.frontFt !== undefined || limits.sideFt !== undefined || limits.rearFt !== undefined

  // What is missing, said once, in the place a reviewer looks first.
  //
  // The sheet used to stamp itself "FOR PERMIT SUBMISSION" with no property
  // line, no structure, no jurisdiction and dashes in the setback box. A packet
  // that comes back rejected costs the builder weeks, so this sheet no longer
  // claims to be submittable when it is not.
  const missing: string[] = []
  if (!lot) missing.push('property line')
  if (report.structures.length === 0) missing.push('house / existing structures')
  if (!hasAnyLimit) missing.push('required setbacks')
  if (!jurisdiction) missing.push('jurisdiction')
  if (!parcelId) missing.push('parcel ID')
  const submittable = missing.length === 0

  const edges = report.edges

  return (
    <div className="site-plan-doc mx-auto max-w-[8in] bg-white p-6 text-xs text-black">
      {/* Title block */}
      <header className="mb-3 grid grid-cols-3 border-2 border-black">
        <div className="col-span-2 border-r-2 border-black p-2">
          <div className="text-[10px] uppercase tracking-widest text-neutral-700">Site Plan</div>
          <h1 className="text-lg font-bold uppercase">{project.name}</h1>
          <div className="text-[11px]">{orNotEntered(customer?.name)}</div>
          <div className="text-[11px]">{orNotEntered(customer?.address)}</div>
        </div>
        <div className="grid grid-cols-2 text-[10px]">
          <div className="border-b border-r border-black p-1">
            <div className="text-neutral-600">Date</div>
            <div className="font-mono">{formatDate(project.createdAt)}</div>
          </div>
          <div className="border-b border-black p-1">
            <div className="text-neutral-600">Scale</div>
            <div className="font-mono">See graphic scale</div>
          </div>
          <div className="border-b border-r border-black p-1">
            <div className="text-neutral-600">Jurisdiction</div>
            <div className="font-mono">{orNotEntered(jurisdiction)}</div>
          </div>
          <div className="border-b border-black p-1">
            <div className="text-neutral-600">Parcel ID</div>
            <div className="truncate font-mono">{orNotEntered(parcelId)}</div>
          </div>
          <div className="border-r border-black p-1">
            <div className="text-neutral-600">Designer</div>
            <div className="font-mono">{orNotEntered(project.designer)}</div>
          </div>
          <div className="p-1">
            <div className="text-neutral-600">Sheet</div>
            <div className="font-mono">SP-1</div>
          </div>
        </div>
      </header>

      {/* Whether this sheet can go to the counter, and why not. */}
      <section
        className={`mb-3 border-2 p-2 text-[11px] ${
          submittable ? 'border-black' : 'border-black bg-neutral-100'
        }`}
      >
        <span className="font-bold uppercase tracking-wide">
          {submittable ? 'Ready for permit submission' : 'Not ready for permit submission'}
        </span>{' '}
        {submittable ? (
          <span>
            Property line, structures and required setbacks are all recorded on the drawing and
            dimensioned below.
          </span>
        ) : (
          <span>
            Missing: {missing.join(', ')}. Add them in the editor (Site panel) before submitting —
            this sheet prints only what has been recorded.
          </span>
        )}
      </section>

      {/* Drawing — survey overlay underneath, plan over the top */}
      <section className="relative border-2 border-black">
        {surveyImageUrl ? (
          <div className="relative">
            <img
              src={surveyImageUrl}
              alt="Survey"
              className="absolute inset-0 h-full w-full object-contain opacity-40"
            />
            <div className="relative">
              <TechnicalPlanSvg shapes={shapes} variant="site" box={PLAN_BOX} />
            </div>
          </div>
        ) : (
          <TechnicalPlanSvg shapes={shapes} variant="site" box={PLAN_BOX} />
        )}
        <div className="border-t border-black bg-neutral-50 px-2 py-1 text-[9px] uppercase tracking-wider text-neutral-700">
          Plan view — drawn to the graphic scale shown · north as indicated
        </div>
      </section>

      {/* Legend, generated from this drawing */}
      <section className="mt-3 border border-black p-2">
        <h2 className="mb-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase tracking-wide">
          Legend
        </h2>
        <PlanLegend shapes={shapes} variant="site" />
      </section>

      {/* Setbacks: required and provided, side by side, both honest */}
      <section className="mt-3 border border-black p-2">
        <h2 className="mb-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase tracking-wide">
          Setbacks &amp; Easements
        </h2>
        {!lot ? (
          <p className="text-[11px]">
            No property line has been drawn for this project, so no setback can be measured. Nothing
            is assumed here: draw the lot in the editor and this table fills itself in.
          </p>
        ) : (
          <>
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-black">
                  <th className="px-1 py-0.5 text-left">Edge</th>
                  <th className="px-1 py-0.5 text-right">Required</th>
                  <th className="px-1 py-0.5 text-right">Provided</th>
                  <th className="px-1 py-0.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {(edges ?? []).map(edge => (
                  <SetbackRow key={edge.edge} edge={edge} />
                ))}
                {edges === null ? (
                  <tr>
                    <td colSpan={4} className="px-1 py-0.5">
                      No pool or spa drawn yet, so nothing is measured against the lot line.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-[11px]">
              <div>
                <span className="text-neutral-600">Lot:</span>{' '}
                {formatNum(lot.width / 12)} ft × {formatNum(lot.height / 12)} ft
              </div>
              <div>
                <span className="text-neutral-600">To structure:</span>{' '}
                {report.toStructureIn === null
                  ? 'No structure placed'
                  : `${formatFtIn(report.toStructureIn)} to ${report.nearestStructureLabel ?? 'structure'}`}
              </div>
              <div className="col-span-2">
                <span className="text-neutral-600">Easements:</span>{' '}
                {limits.easements ?? 'None entered'}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Pool footprint */}
      <section className="mt-3 border border-black p-2">
        <h2 className="mb-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase tracking-wide">
          Pool Footprint
        </h2>
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 font-mono text-[11px]">
          <div>
            <span className="text-neutral-600">Length:</span> {formatNum(m.poolLengthFt)} ft
          </div>
          <div>
            <span className="text-neutral-600">Width:</span> {formatNum(m.poolWidthFt)} ft
          </div>
          <div>
            <span className="text-neutral-600">Surface:</span> {formatNum(m.poolSurfaceArea)} sf
          </div>
          <div>
            <span className="text-neutral-600">Perimeter:</span> {formatNum(m.poolPerimeter)} lf
          </div>
          <div>
            <span className="text-neutral-600">Deck:</span> {formatNum(m.deckArea)} sf
          </div>
          <div>
            <span className="text-neutral-600">Coping:</span> {formatNum(m.copingLinearFeet)} lf
          </div>
        </div>
      </section>

      {/* Access + permit notes */}
      <section className="mt-3 border border-black p-2">
        <h2 className="mb-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase tracking-wide">
          Access &amp; Site Notes
        </h2>
        <div className="whitespace-pre-wrap text-[11px]">
          {project.internalNotes?.trim() || pf.accessNotes || 'None entered'}
        </div>
      </section>

      {/* Permit signature block */}
      <section className="mt-3 grid grid-cols-3 gap-3 text-[10px]">
        <div className="border border-black p-2">
          <div className="text-neutral-600">Owner signature</div>
          <div className="mt-6 border-b border-black" />
          <div className="mt-1 flex justify-between">
            <span>Date</span>
            <span>____________</span>
          </div>
        </div>
        <div className="border border-black p-2">
          <div className="text-neutral-600">Contractor signature</div>
          <div className="mt-6 border-b border-black" />
          <div className="mt-1 flex justify-between">
            <span>Date</span>
            <span>____________</span>
          </div>
        </div>
        <div className="border border-black p-2">
          <div className="text-neutral-600">Reviewer / inspector</div>
          <div className="mt-6 border-b border-black" />
          <div className="mt-1 flex justify-between">
            <span>Date</span>
            <span>____________</span>
          </div>
        </div>
      </section>

      <footer className="mt-3 border-t border-black pt-1 text-center text-[9px] uppercase tracking-wider text-neutral-600">
        {submittable
          ? 'Site plan — for permit submission'
          : 'Site plan — draft, not for permit submission'}{' '}
        · Sheet SP-1 · Designer {orNotEntered(project.designer)}
      </footer>
    </div>
  )
}

function SetbackRow({ edge }: { edge: EdgeSetback }) {
  const status =
    edge.compliant === null ? 'No limit entered' : edge.compliant ? 'Meets' : 'DOES NOT MEET'
  return (
    <tr className="border-b border-neutral-300">
      <td className="px-1 py-0.5">{EDGE_LABEL[edge.edge]}</td>
      <td className="px-1 py-0.5 text-right">
        {edge.requiredIn === null ? 'Not entered' : formatFtIn(edge.requiredIn)}
      </td>
      <td className="px-1 py-0.5 text-right">{formatSignedFtIn(edge.distanceIn)}</td>
      <td className={`px-1 py-0.5 text-right ${edge.compliant === false ? 'font-bold' : ''}`}>
        {status}
      </td>
    </tr>
  )
}
