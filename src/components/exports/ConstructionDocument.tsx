import type { MeasurementSummary } from '@/modules/measurements/engine'
import { ShapeKind } from '@prisma/client'
import type { QuoteSummary } from '@/modules/pricing/engine'
import { formatUsd } from '@/lib/money'
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
  interiorFinish?: string
  equipmentPackage?: string
  sanitizationPackage?: string
  heaterSelection?: string
  heaterFuel?: string
  pumpSelection?: string
  lightingSelection?: string
  lightingQuantity?: number | string
  deckMaterial?: string
  copingMaterial?: string
  screenOption?: string
  screenSelected?: boolean
  // Canonical key written by the project form — see modules/projects/pool-fields.
  saltSystemSelected?: boolean
  heaterSelected?: boolean
  spaSpecs?: string
  accessNotes?: string
}

export type ConstructionPageSize = 'letter' | 'tabloid'

export interface ConstructionDocumentProps {
  project: ProjectLite
  customer: CustomerLite | null
  shapes: Shape[]
  measurements: MeasurementSummary
  quote: QuoteSummary
  pageSize?: ConstructionPageSize
}

const SYMBOL_LEGEND = [
  'Equipment pad',
  'Access arrow',
  'Property line',
  'Setback line',
  'Center line',
  'Dimension line',
  'Approval block',
  'Construction notes block',
]

function formatNum(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function v(s?: string | number | null | boolean): string {
  if (s === undefined || s === null || s === '' || s === false) return '—'
  if (s === true) return 'Yes'
  return String(s)
}

export function ConstructionDocument(props: ConstructionDocumentProps) {
  const { project, customer, shapes, measurements: m, quote, pageSize = 'tabloid' } = props
  const pf = (project.poolFields ?? {}) as PoolFields
  const hasSpa = shapes.some((s) => s.kind === ShapeKind.SPA)
  // Tabloid (11×17 landscape) is the default — Jimmy prints 10 copies of the onion-skin
  // for site use. Letter is opt-in for offices without a 17" printer.
  const widthClass = pageSize === 'tabloid' ? 'max-w-[16in]' : 'max-w-[8in]'
  const drawingW = pageSize === 'tabloid' ? 1400 : 760
  const drawingH = pageSize === 'tabloid' ? 720 : 480

  return (
    <div className={`construction-doc size-${pageSize} mx-auto ${widthClass} bg-white p-6 text-xs text-black`}>
      {/* Header */}
      <header className="mb-4 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-600">
            Construction Packet
          </div>
          <h1 className="text-xl font-bold">{project.name}</h1>
          <div className="text-[11px]">
            {customer?.name ?? '—'} · {customer?.address ?? '—'}
          </div>
        </div>
        <div className="text-right text-[10px]">
          <div>
            <span className="text-neutral-600">Date:</span> {formatDate(project.createdAt)}
          </div>
          <div>
            <span className="text-neutral-600">Project ID:</span> {project.id}
          </div>
          <div>
            <span className="text-neutral-600">Designer:</span> {v(project.designer)}
          </div>
          <div>
            <span className="text-neutral-600">Salesperson:</span> {v(project.salesperson)}
          </div>
        </div>
      </header>

      {/* Customer information */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Customer Information
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
          <div>
            <span className="text-neutral-600">Name:</span> {v(customer?.name)}
          </div>
          <div>
            <span className="text-neutral-600">Phone:</span> {v(customer?.phone)}
          </div>
          <div className="col-span-2">
            <span className="text-neutral-600">Address:</span> {v(customer?.address)}
          </div>
          <div className="col-span-2">
            <span className="text-neutral-600">Email:</span> {v(customer?.email)}
          </div>
        </div>
      </section>

      {/* Pool specifications */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Pool Specifications
        </h2>
        <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 font-mono text-[11px]">
          <Row k="Length" val={`${formatNum(m.poolLengthFt)} ft`} />
          <Row k="Width" val={`${formatNum(m.poolWidthFt)} ft`} />
          <Row k="Surface area" val={`${formatNum(m.poolSurfaceArea)} sqft`} />
          <Row k="Perimeter" val={`${formatNum(m.poolPerimeter)} lf`} />
          <Row k="Wetted area" val={`${formatNum(m.poolWettedArea)} sqft`} />
          <Row k="Gallons" val={formatNum(m.poolGallons, 0)} />
          <Row k="Avg depth" val={`${formatNum(m.poolAvgDepth)} ft`} />
          <Row k="Shallow depth" val={`${formatNum(m.poolDepthShallow)} ft`} />
          <Row k="Deep depth" val={`${formatNum(m.poolDepthDeep)} ft`} />
          <Row k="Pool type" val={v(pf.poolType)} />
          <Row k="Interior finish" val={v(pf.interiorFinish)} />
          <Row k="Coping material" val={v(pf.copingMaterial)} />
        </div>
      </section>

      {/* Spa specifications */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Spa Specifications
        </h2>
        {hasSpa ? (
          <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 font-mono text-[11px]">
            <Row k="Spa shape" val="Square (default)" />
            <Row k="Spa size" val="7 × 7 ft" />
            <Row k="Notes" val={v(pf.spaSpecs)} />
          </div>
        ) : (
          <div className="text-[11px] italic text-neutral-600">N/A — no spa in this design.</div>
        )}
      </section>

      {/* Screen specifications */}
      {pf.screenSelected ? (
        <section className="mb-3">
          <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
            Screen Specifications
          </h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 font-mono text-[11px]">
            <Row k="Option" val={v(pf.screenOption)} />
            <Row k="Coverage" val={`${formatNum(m.deckArea)} sqft`} />
            <Row k="Material" val="Phifer SunScreen (default)" />
          </div>
        </section>
      ) : null}

      {/* Equipment list */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Equipment List
        </h2>
        <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 font-mono text-[11px]">
          <Row k="Heater" val={v(pf.heaterSelection || pf.heaterSelected)} />
          <Row k="Heater fuel" val={v(pf.heaterFuel)} />
          <Row k="Pump" val={v(pf.pumpSelection)} />
          <Row k="Sanitization" val={v(pf.sanitizationPackage)} />
          <Row k="Salt system" val={v(pf.saltSystemSelected)} />
          <Row k="Equipment pkg" val={v(pf.equipmentPackage)} />
          <Row k="Lighting" val={v(pf.lightingSelection)} />
          <Row k="Lighting qty" val={v(pf.lightingQuantity)} />
        </div>
      </section>

      {/* Deck specifications */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Deck Specifications
        </h2>
        <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 font-mono text-[11px]">
          <Row k="Material" val={v(pf.deckMaterial)} />
          <Row k="Area" val={`${formatNum(m.deckArea)} sqft`} />
          <Row k="Coping" val={`${formatNum(m.copingLinearFeet)} lf`} />
          <Row k="Deco drain" val={`${formatNum(m.decoDrainLinearFeet)} lf`} />
        </div>
      </section>

      {/* Drawing */}
      <section className="page-break mb-3 mt-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Construction Layout
        </h2>
        <DrawingSvg shapes={shapes} widthPx={drawingW} heightPx={drawingH} />
      </section>

      {/* Access notes */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Access Notes
        </h2>
        <div className="whitespace-pre-wrap text-[11px]">
          {project.internalNotes?.trim() || pf.accessNotes || '—'}
        </div>
      </section>

      {/* Equipment pad notes */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Equipment Pad Notes
        </h2>
        <div className="text-[11px]">
          Locate equipment pad per site survey. Verify clearances per manufacturer specs and local code.
        </div>
      </section>

      {/* Construction notes */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Construction Notes
        </h2>
        <ul className="list-disc pl-5 text-[11px]">
          <li>All bonding to NEC 680. Equipotential bonding grid required.</li>
          <li>Plumb returns and main drain per applicable VGB requirements.</li>
          <li>Coping installation per manufacturer with mortar bed.</li>
          <li>Verify setbacks against property line and structures before excavation.</li>
        </ul>
      </section>

      {/* Selection table */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Selection Table
        </h2>
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr className="border-b border-black">
              <th className="border-r border-black px-1 py-0.5 text-left">Category</th>
              <th className="border-r border-black px-1 py-0.5 text-left">Selection</th>
              <th className="px-1 py-0.5 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Pool type', pf.poolType, ''],
              ['Interior finish', pf.interiorFinish, ''],
              ['Coping', pf.copingMaterial, ''],
              ['Deck material', pf.deckMaterial, ''],
              ['Heater', pf.heaterSelection, pf.heaterFuel ?? (pf.heaterSelected ? 'Included' : 'Not selected')],
              ['Pump', pf.pumpSelection, ''],
              ['Sanitization', pf.sanitizationPackage, pf.saltSystemSelected ? 'Salt system' : ''],
              ['Lighting', pf.lightingSelection, pf.lightingQuantity ? `${pf.lightingQuantity} fixtures` : ''],
              ['Screen', pf.screenOption, pf.screenSelected ? 'Included' : 'Not selected'],
            ].map(([cat, sel, note]) => (
              <tr key={cat as string} className="border-b border-neutral-300">
                <td className="border-r border-neutral-300 px-1 py-0.5">{cat}</td>
                <td className="border-r border-neutral-300 px-1 py-0.5">{v(sel as string | null)}</td>
                <td className="px-1 py-0.5">{(note as string) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Symbol legend */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Symbol Legend
        </h2>
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          {SYMBOL_LEGEND.map((label) => (
            <div key={label} className="flex items-center gap-2">
              <div className="h-5 w-5 border border-black bg-neutral-100" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Quote summary (compact) */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Quote Summary
        </h2>
        {quote.status === 'PRICED' ? (
          <div className="font-mono text-[11px]">
            <div className="flex justify-between border-b border-neutral-300 py-0.5">
              <span>Line items</span>
              <span>{quote.lineItems.length}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-0.5">
              <span>Subtotal</span>
              <span>{formatUsd(quote.subtotal)}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-0.5">
              <span>Sales tax ({quote.taxRatePct}%)</span>
              <span>{formatUsd(quote.taxAmount)}</span>
            </div>
            <div className="flex justify-between py-0.5 font-bold">
              <span>Total</span>
              <span>{formatUsd(quote.total)}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px]">
            {quote.status === 'NO_PRICE_BOOK'
              ? 'Not priced: this company has no active price book, so no figure can be printed here.'
              : 'Not priced: nothing has been drawn for this project yet.'}
          </p>
        )}
        {quote.unpriced.length > 0 && (
          <p className="mt-1 text-[10px]">
            Drawn but not priced:{' '}
            {quote.unpriced.map((u) => `${u.label} (${u.reason.toLowerCase()})`).join('; ')}.
          </p>
        )}
      </section>

      {/* Contractor notes */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Contractor Notes
        </h2>
        <div className="h-24 border border-black p-1" />
      </section>

      {/* Signatures */}
      <section className="mt-6 grid grid-cols-2 gap-8 text-[11px]">
        <div>
          <div className="border-b border-black pb-6" />
          <div className="mt-1 flex justify-between">
            <span>Customer signature</span>
            <span>Date: ____________</span>
          </div>
        </div>
        <div>
          <div className="border-b border-black pb-6" />
          <div className="mt-1 flex justify-between">
            <span>Builder signature</span>
            <span>Date: ____________</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function Row({ k, val }: { k: string; val: string }) {
  return (
    <div>
      <span className="text-neutral-600">{k}:</span> {val}
    </div>
  )
}
