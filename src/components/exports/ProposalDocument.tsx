import { Fragment } from 'react'
import type { Customer, Project } from '@prisma/client'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import { categoryLabel, type QuoteSummary, type QuoteLine } from '@/modules/pricing/engine'
import { formatUsd, formatUsdCents } from '@/lib/money'
import type { Shape } from '@/modules/editor/state/shapes'
import { readPoolFields } from '@/modules/projects/pool-fields'
import { DrawingSvg } from './DrawingSvg'

interface ProposalDocumentProps {
  project: Project
  customer: Customer | null
  measurements: MeasurementSummary
  quote: QuoteSummary
  selections: {
    heaterSelected: boolean
    saltSystemSelected: boolean
    screenSelected: boolean
    lightingQuantity: number
  }
  companyName: string
  logoUrl?: string | null
  brandColor?: string | null
  showInternalNotes?: boolean
  shapes?: Shape[]
}

// Shared formatters: the packet and the dock print the identical string for
// the identical number, which is the whole point of "one number everywhere".
const fmtMoney = formatUsd
const fmtMoneyPrecise = formatUsdCents

const fmtNumber = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits })

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return null
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function groupLineItems(lines: QuoteLine[]): Map<string, QuoteLine[]> {
  const groups = new Map<string, QuoteLine[]>()
  for (const line of lines) {
    // Grouped by the readable category name: the sheet used to head each block
    // with the raw enum, so a customer read "WATER_FEATURE".
    const key = categoryLabel(line.category)
    const arr = groups.get(key) ?? []
    arr.push(line)
    groups.set(key, arr)
  }
  return groups
}

export function ProposalDocument({
  project,
  customer,
  measurements,
  quote,
  selections,
  companyName,
  logoUrl = null,
  brandColor = null,
  showInternalNotes = false,
  shapes = [],
}: ProposalDocumentProps) {
  const accent = brandColor && /^#[0-9a-fA-F]{3,8}$/.test(brandColor) ? brandColor : '#0f172a'
  const safeLogo =
    typeof logoUrl === 'string' && /^(https?:\/\/|data:image\/)/.test(logoUrl) ? logoUrl : null
  // Through the one reader, and blank counts as unanswered. Reading the raw
  // JSON meant an empty string was a string, so the `?? 'Not specified'`
  // fallbacks below never fired and the Sanitization row printed nothing at all
  // on a project with salt switched on.
  const poolFields = readPoolFields(project.poolFields)
  const interiorFinish = poolFields.interiorFinish.trim() || null
  const sanitization = poolFields.sanitizationPackage.trim() || null
  const deckMaterial = poolFields.deckMaterial.trim() || null

  const groups = groupLineItems(quote.lineItems)
  const today = fmtDate(new Date())
  const expiresAt = fmtDate(project.proposalExpiresAt)

  return (
    <article className="proposal-page font-serif text-[11pt] leading-relaxed text-slate-900">
      {/* Header */}
      <header
        className="flex items-start justify-between border-b-2 pb-4"
        style={{ borderColor: accent }}
      >
        <div>
          {safeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={safeLogo} alt={companyName} className="mb-2 h-12 w-auto object-contain" />
          ) : null}
          <div className="font-sans text-2xl font-bold tracking-tight" style={{ color: accent }}>
            {companyName}
          </div>
          <div className="mt-1 font-sans text-xs uppercase tracking-widest text-slate-500">
            Pool Forge
          </div>
        </div>
        <div className="text-right text-sm">
          <div>
            <span className="text-slate-500">Date:</span> {today}
          </div>
          {expiresAt ? (
            <div>
              <span className="text-slate-500">Valid until:</span> {expiresAt}
            </div>
          ) : null}
          <div>
            <span className="text-slate-500">Proposal #:</span> {project.id.slice(-8).toUpperCase()}
          </div>
        </div>
      </header>

      <h1 className="mt-8 font-sans text-3xl font-semibold">Pool Construction Proposal</h1>

      {/* Prepared for */}
      <section className="mt-6 grid grid-cols-2 gap-8">
        <Block title="Prepared for">
          <div className="font-medium">{customer?.name ?? 'Not specified'}</div>
          {customer?.address ? <div>{customer.address}</div> : null}
          {customer?.email ? <div className="text-slate-600">{customer.email}</div> : null}
          {customer?.phone ? <div className="text-slate-600">{customer.phone}</div> : null}
        </Block>
        <Block title="Project specifications">
          <Row label="Project" value={project.name} />
          <Row label="Salesperson" value={project.salesperson ?? 'Not specified'} />
          <Row label="Designer" value={project.designer ?? 'Not specified'} />
        </Block>
      </section>

      {/* Drawing */}
      <section className="mt-8">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-500">
          Plan view
        </h2>
        <div className="mt-2">
          <DrawingSvg shapes={shapes} widthPx={760} heightPx={420} />
        </div>
      </section>

      {/* Pool specs */}
      <section className="mt-8 grid grid-cols-2 gap-8">
        <Block title="Pool specifications">
          <Row
            label="Dimensions"
            value={
              measurements.hasPool
                ? `${fmtNumber(measurements.poolLengthFt, 1)} ft × ${fmtNumber(
                    measurements.poolWidthFt,
                    1,
                  )} ft`
                : 'Not specified'
            }
          />
          <Row
            label="Depth"
            value={
              measurements.hasPool
                ? `${fmtNumber(measurements.poolDepthShallow, 1)} ft shallow / ${fmtNumber(
                    measurements.poolDepthDeep,
                    1,
                  )} ft deep`
                : 'Not specified'
            }
          />
          <Row
            label="Surface area"
            value={`${fmtNumber(measurements.poolSurfaceArea)} sqft`}
          />
          <Row label="Perimeter" value={`${fmtNumber(measurements.poolPerimeter, 1)} lf`} />
          <Row label="Wetted area" value={`${fmtNumber(measurements.poolWettedArea)} sqft`} />
          <Row label="Volume" value={`${fmtNumber(measurements.poolGallons)} gal`} />
        </Block>

        <Block title="Equipment & features">
          <Row label="Interior finish" value={interiorFinish ?? 'Not specified'} />
          <Row label="Sanitization" value={sanitization ?? (selections.saltSystemSelected ? 'Salt system' : 'Not specified')} />
          <Row label="Heater" value={selections.heaterSelected ? 'Included' : 'Not included'} />
          <Row
            label="Screen enclosure"
            value={selections.screenSelected ? 'Included' : 'Not included'}
          />
          <Row
            label="Pool lighting"
            value={
              selections.lightingQuantity > 0
                ? `${selections.lightingQuantity} light${selections.lightingQuantity === 1 ? '' : 's'}`
                : 'Not specified'
            }
          />
        </Block>
      </section>

      {/* Deck specs */}
      <section className="mt-8">
        <Block title="Deck specifications">
          <Row label="Deck material" value={deckMaterial ?? 'Not specified'} />
          <Row
            label="Deck area"
            value={measurements.hasDeck ? `${fmtNumber(measurements.deckArea)} sqft` : 'Not specified'}
          />
          <Row
            label="Coping"
            value={`${fmtNumber(measurements.copingLinearFeet, 1)} lf`}
          />
        </Block>
      </section>

      {/* Investment */}
      <section className="mt-8 page-break-before">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-500">
          Investment summary
        </h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left font-sans text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Unit price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([category, lines]) => (
              <Fragment key={category}>
                <tr className="bg-slate-50">
                  <td colSpan={4} className="px-2 py-2 font-sans text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {category}
                  </td>
                </tr>
                {lines.map((line) => (
                  <tr key={line.itemId} className="border-b border-slate-100">
                    <td className="py-2 pr-2">{line.name}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {fmtNumber(line.quantity, 2)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {fmtMoneyPrecise(line.unitPrice)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(line.total)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {quote.lineItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">
                  {quote.status === 'NO_PRICE_BOOK'
                    ? 'This design cannot be priced: there is no active price book. No total is shown rather than a total of zero.'
                    : 'Nothing has been drawn for this project yet, so there is nothing to price.'}
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot className={quote.status === 'PRICED' ? '' : 'hidden'}>
            <tr className="border-t-2" style={{ borderColor: accent }}>
              <td colSpan={3} className="py-3 text-right font-sans text-sm font-semibold uppercase tracking-wide">
                Subtotal
              </td>
              <td className="py-3 text-right tabular-nums">{fmtMoney(quote.subtotal)}</td>
            </tr>
            {quote.taxRatePct > 0 ? (
              <tr>
                <td colSpan={3} className="py-1 text-right font-sans text-sm text-slate-600">
                  Sales tax ({fmtNumber(quote.taxRatePct, 3)}%)
                </td>
                <td className="py-1 text-right tabular-nums">{fmtMoney(quote.taxAmount)}</td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={3} className="py-3 text-right font-sans text-base font-semibold uppercase tracking-wide">
                Total investment
              </td>
              <td
                className="py-3 text-right text-lg font-semibold tabular-nums"
                style={{ color: accent }}
              >
                {fmtMoney(quote.total)}
              </td>
            </tr>
          </tfoot>
        </table>
        {quote.unpriced.length > 0 ? (
          <p className="mt-3 text-xs text-slate-600">
            Not included in the figures above:{' '}
            {quote.unpriced.map((u) => u.label.toLowerCase()).join(', ')}. Ask us for a price on
            these before you sign.
          </p>
        ) : null}
      </section>

      {/* Notes */}
      {showInternalNotes && project.internalNotes ? (
        <section className="mt-8">
          <Block title="Notes">
            <p className="whitespace-pre-wrap text-sm">{project.internalNotes}</p>
          </Block>
        </section>
      ) : null}

      {/* Disclaimers */}
      <section className="mt-8 border-t border-slate-300 pt-4 text-xs text-slate-600">
        <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-slate-500">
          Terms & disclaimers
        </h3>
        <p>
          Pricing valid until the proposal expiration date listed above. All work subject to
          permit approval and final site survey. Final pricing may vary based on actual site
          conditions discovered during construction. Excavation surprises, rock removal, and
          dewatering are billed separately at standard hourly rates. Customer is responsible for
          access to the build site and removal of any obstructions prior to the start of work.
        </p>
      </section>

      <footer className="mt-8 border-t border-slate-300 pt-4 text-center text-[10pt] text-slate-500">
        {companyName} · Generated {today}
      </footer>
    </article>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
      <div className="mt-2 space-y-1 text-sm">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
