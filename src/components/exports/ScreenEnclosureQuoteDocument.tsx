import type { MeasurementSummary } from '@/modules/measurements/engine'
import type { QuoteSummary } from '@/modules/pricing/engine'
import type { Shape } from '@/modules/editor/state/shapes'
import { DrawingSvg } from './DrawingSvg'
import { formatUsd } from '@/lib/money'

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
  internalNotes: string | null
  poolFields: unknown
  createdAt: Date
}

export type ScreenType = 'STANDARD' | 'NO_SEAM' | 'CLEAR_REVIEW'

interface PoolFields {
  screenSelected?: boolean
  screenOption?: string
  screenHeight?: string | number
  screenType?: ScreenType | string
  screenNotes?: string
  poolType?: string
}

export interface ScreenEnclosureQuoteDocumentProps {
  project: ProjectLite
  customer: CustomerLite | null
  shapes: Shape[]
  measurements: MeasurementSummary
  quote: QuoteSummary
  /** Sender's company name (the one requesting the quote). */
  companyName: string
  /** When false, the doc is a pure RFQ — no prices visible. Default false. */
  showInternalPricing?: boolean
  /** When true, shows the retail subtotal scoped to screen-related items. Default false. */
  showScreenScopeRetail?: boolean
}

const SCREEN_TYPE_LABEL: Record<ScreenType, string> = {
  STANDARD: 'Standard screening',
  NO_SEAM: 'No-seam screening',
  CLEAR_REVIEW: 'Clear-review screening',
}

function formatNum(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const formatMoney = formatUsd

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function v(s?: string | number | null): string {
  if (s === undefined || s === null || s === '') return '—'
  return String(s)
}

function isScreenType(s: unknown): s is ScreenType {
  return s === 'STANDARD' || s === 'NO_SEAM' || s === 'CLEAR_REVIEW'
}

export function ScreenEnclosureQuoteDocument(props: ScreenEnclosureQuoteDocumentProps) {
  const {
    project,
    customer,
    shapes,
    measurements: m,
    quote,
    companyName,
    showInternalPricing = false,
    showScreenScopeRetail = false,
  } = props
  const pf = (project.poolFields ?? {}) as PoolFields
  const screenType = isScreenType(pf.screenType) ? pf.screenType : 'STANDARD'
  const screenTypeLabel = SCREEN_TYPE_LABEL[screenType]

  // Filter quote line items down to screen-scope only.
  const screenLines = quote.lineItems.filter(
    (li) => li.category === 'SCREEN' || /screen/i.test(li.name),
  )
  const screenSubtotal = screenLines.reduce((acc, li) => acc + li.total, 0)

  return (
    <div className="screen-rfq-doc mx-auto max-w-[8in] bg-white p-6 text-xs text-black">
      {/* Header */}
      <header className="mb-4 border-b-2 border-black pb-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-600">
              Request for Quote — Screen Enclosure
            </div>
            <h1 className="text-xl font-bold uppercase">{project.name}</h1>
            <div className="text-[11px]">From: {companyName}</div>
          </div>
          <div className="text-right text-[10px]">
            <div>
              <span className="text-neutral-600">Date:</span> {formatDate(project.createdAt)}
            </div>
            <div>
              <span className="text-neutral-600">RFQ #:</span>{' '}
              {project.id.slice(-8).toUpperCase()}
            </div>
            <div>
              <span className="text-neutral-600">Salesperson:</span> {v(project.salesperson)}
            </div>
          </div>
        </div>
      </header>

      {/* Site / customer */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Site Information
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
          <div className="col-span-2">
            <span className="text-neutral-600">Address:</span> {v(customer?.address)}
          </div>
          <div>
            <span className="text-neutral-600">Customer:</span> {v(customer?.name)}
          </div>
          <div>
            <span className="text-neutral-600">Phone:</span> {v(customer?.phone)}
          </div>
        </div>
      </section>

      {/* Screen specifics — the part the subcontractor needs to quote */}
      <section className="mb-3 border-2 border-black p-2">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">
          Screen Specifications
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
          <div>
            <span className="text-neutral-600">Height:</span>{' '}
            {pf.screenHeight ? `${v(pf.screenHeight)} ft` : '—'}
          </div>
          <div>
            <span className="text-neutral-600">Type:</span> {screenTypeLabel}
          </div>
          <div>
            <span className="text-neutral-600">Option:</span> {v(pf.screenOption)}
          </div>
          <div>
            <span className="text-neutral-600">Coverage:</span>{' '}
            {formatNum(m.deckArea)} sqft (deck)
          </div>
          <div>
            <span className="text-neutral-600">Pool perimeter:</span>{' '}
            {formatNum(m.poolPerimeter)} lf
          </div>
          <div>
            <span className="text-neutral-600">Pool size:</span>{' '}
            {formatNum(m.poolLengthFt)} × {formatNum(m.poolWidthFt)} ft
          </div>
        </div>
        {pf.screenNotes ? (
          <div className="mt-2 whitespace-pre-wrap border-t border-black pt-2 text-[11px]">
            <span className="font-semibold">Special requests:</span> {pf.screenNotes}
          </div>
        ) : null}
      </section>

      {/* Drawing — Billy uses blue callouts for special types like "clear review" */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Plan View — Annotated
        </h2>
        <DrawingSvg shapes={shapes} widthPx={760} heightPx={460} />
        <div className="mt-1 text-[10px] italic text-neutral-600">
          Callouts label any non-standard scope (e.g., clear-review or no-seam panels).
        </div>
      </section>

      {/* Pricing — hidden by default; this is an RFQ */}
      {showScreenScopeRetail || showInternalPricing ? (
        <section className="mb-3">
          <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
            Reference Pricing (internal)
          </h2>
          {showInternalPricing ? (
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-black">
                  <th className="border-r border-black px-1 py-0.5 text-left">Item</th>
                  <th className="border-r border-black px-1 py-0.5 text-right">Qty</th>
                  <th className="border-r border-black px-1 py-0.5 text-right">Unit</th>
                  <th className="px-1 py-0.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {screenLines.map((line) => (
                  <tr key={line.itemId} className="border-b border-neutral-300">
                    <td className="border-r border-neutral-300 px-1 py-0.5">{line.name}</td>
                    <td className="border-r border-neutral-300 px-1 py-0.5 text-right">
                      {formatNum(line.quantity, 1)}
                    </td>
                    <td className="border-r border-neutral-300 px-1 py-0.5 text-right">
                      {formatMoney(line.unitPrice)}
                    </td>
                    <td className="px-1 py-0.5 text-right">{formatMoney(line.total)}</td>
                  </tr>
                ))}
                {screenLines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-1 py-2 text-center italic text-neutral-500">
                      {quote.status === 'PRICED'
                        ? 'No screen-scope line items in current quote.'
                        : quote.status === 'NO_PRICE_BOOK'
                          ? 'No active price book, so this design cannot be priced.'
                          : 'Nothing drawn yet, so there is nothing to price.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : quote.status === 'PRICED' ? (
            <div className="font-mono text-[11px]">
              <div className="flex justify-between border-b border-neutral-300 py-0.5">
                <span>Screen scope subtotal (retail)</span>
                <span>{formatMoney(screenSubtotal)}</span>
              </div>
            </div>
          ) : (
            <p className="font-mono text-[11px]">
              {quote.status === 'NO_PRICE_BOOK'
                ? 'No active price book, so no retail figure can be shown.'
                : 'Nothing drawn yet, so there is no scope to price.'}
            </p>
          )}
          <div className="mt-1 text-[9px] italic text-red-700">
            Internal reference only. Do not share with subcontractor.
          </div>
        </section>
      ) : (
        <section className="mb-3 border border-dashed border-neutral-400 bg-neutral-50 p-2 text-[10px] italic text-neutral-600">
          Pricing intentionally omitted — this is a request for quote.
        </section>
      )}

      {/* Quote response area */}
      <section className="mb-3">
        <h2 className="mb-1 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">
          Vendor Response
        </h2>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="border border-black p-2">
            <div className="text-neutral-600">Vendor name</div>
            <div className="mt-4 border-b border-black" />
          </div>
          <div className="border border-black p-2">
            <div className="text-neutral-600">Quoted price</div>
            <div className="mt-4 border-b border-black" />
          </div>
          <div className="border border-black p-2">
            <div className="text-neutral-600">Lead time</div>
            <div className="mt-4 border-b border-black" />
          </div>
          <div className="border border-black p-2">
            <div className="text-neutral-600">Quote valid until</div>
            <div className="mt-4 border-b border-black" />
          </div>
          <div className="col-span-2 border border-black p-2">
            <div className="text-neutral-600">Notes / exclusions</div>
            <div className="mt-1 h-20" />
          </div>
        </div>
      </section>

      <footer className="mt-4 border-t border-black pt-1 text-center text-[9px] uppercase tracking-wider text-neutral-600">
        Please return signed quote to {companyName} · RFQ {project.id.slice(-8).toUpperCase()}
      </footer>
    </div>
  )
}
