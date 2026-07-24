import type { MeasurementSummary } from '@/modules/measurements/engine'
import type { Shape } from '@/modules/editor/state/shapes'
import { DrawingSvg } from './DrawingSvg'

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
  setbackFront?: string | number
  setbackSide?: string | number
  setbackRear?: string | number
  easementNotes?: string
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

function formatNum(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function v(s?: string | number | null): string {
  if (s === undefined || s === null || s === '') return '—'
  return String(s)
}

export function SitePlanDocument(props: SitePlanDocumentProps) {
  const { project, customer, shapes, measurements: m, surveyImageUrl, jurisdiction, parcelId } = props
  const pf = (project.poolFields ?? {}) as PoolFields

  return (
    <div className="site-plan-doc mx-auto max-w-[8in] bg-white p-6 text-xs text-black">
      {/* Title block — for permit submission */}
      <header className="mb-3 grid grid-cols-3 border-2 border-black">
        <div className="col-span-2 border-r-2 border-black p-2">
          <div className="text-[10px] uppercase tracking-widest text-neutral-700">Site Plan</div>
          <h1 className="text-lg font-bold uppercase">{project.name}</h1>
          <div className="text-[11px]">{customer?.name ?? '—'}</div>
          <div className="text-[11px]">{customer?.address ?? '—'}</div>
        </div>
        <div className="grid grid-cols-2 text-[10px]">
          <div className="border-b border-r border-black p-1">
            <div className="text-neutral-600">Date</div>
            <div className="font-mono">{formatDate(project.createdAt)}</div>
          </div>
          <div className="border-b border-black p-1">
            <div className="text-neutral-600">Project ID</div>
            <div className="truncate font-mono">{project.id.slice(-8).toUpperCase()}</div>
          </div>
          <div className="border-b border-r border-black p-1">
            <div className="text-neutral-600">Jurisdiction</div>
            <div className="font-mono">{v(jurisdiction)}</div>
          </div>
          <div className="border-b border-black p-1">
            <div className="text-neutral-600">Parcel ID</div>
            <div className="truncate font-mono">{v(parcelId)}</div>
          </div>
          <div className="border-r border-black p-1">
            <div className="text-neutral-600">Designer</div>
            <div className="font-mono">{v(project.designer)}</div>
          </div>
          <div className="p-1">
            <div className="text-neutral-600">Sheet</div>
            <div className="font-mono">SP-1</div>
          </div>
        </div>
      </header>

      {/* Drawing — survey overlay underneath, plan over the top */}
      <section className="relative border-2 border-black">
        {surveyImageUrl ? (
          <div className="relative">
            {/* Survey image as background, drawing layered above */}
            <img
              src={surveyImageUrl}
              alt="Survey"
              className="absolute inset-0 h-full w-full object-contain opacity-40"
            />
            <div className="relative">
              <DrawingSvg shapes={shapes} widthPx={760} heightPx={520} />
            </div>
          </div>
        ) : (
          <DrawingSvg shapes={shapes} widthPx={760} heightPx={520} />
        )}
        <div className="border-t border-black bg-neutral-50 px-2 py-1 text-[9px] uppercase tracking-wider text-neutral-700">
          Plan view — not to scale unless dimensioned
        </div>
      </section>

      {/* Setbacks + measurements */}
      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="border border-black p-2">
          <h2 className="mb-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase tracking-wide">
            Setbacks &amp; Easements
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px]">
            <div>
              <span className="text-neutral-600">Front:</span> {v(pf.setbackFront)}
            </div>
            <div>
              <span className="text-neutral-600">Side:</span> {v(pf.setbackSide)}
            </div>
            <div className="col-span-2">
              <span className="text-neutral-600">Rear:</span> {v(pf.setbackRear)}
            </div>
            <div className="col-span-2">
              <span className="text-neutral-600">Easements:</span>{' '}
              {pf.easementNotes?.trim() || '—'}
            </div>
          </div>
        </div>

        <div className="border border-black p-2">
          <h2 className="mb-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase tracking-wide">
            Pool Footprint
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px]">
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
              <span className="text-neutral-600">Coping:</span>{' '}
              {formatNum(m.copingLinearFeet)} lf
            </div>
          </div>
        </div>
      </section>

      {/* Access + permit notes */}
      <section className="mt-3 border border-black p-2">
        <h2 className="mb-1 border-b border-black pb-0.5 text-[10px] font-bold uppercase tracking-wide">
          Access &amp; Site Notes
        </h2>
        <div className="whitespace-pre-wrap text-[11px]">
          {project.internalNotes?.trim() || pf.accessNotes || '—'}
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
        Site plan — for permit submission · Project {project.id.slice(-8).toUpperCase()} · Designer {v(project.designer)}
      </footer>
    </div>
  )
}
