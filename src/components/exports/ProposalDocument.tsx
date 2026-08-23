import { Fragment } from 'react'
import type { Customer, Project } from '@prisma/client'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import { categoryLabel, type QuoteSummary, type QuoteLine } from '@/modules/pricing/engine'
import { formatUsd, formatUsdCents } from '@/lib/money'
import type { Shape } from '@/modules/editor/state/shapes'
import { readPoolFields } from '@/modules/projects/pool-fields'
import {
  allocateSchedule,
  proposalExpiry,
  type CompanyProfile,
  type PaymentStage,
} from '@/modules/organization/company'
import { exclusions, scopeOfWork, scopeSummary } from '@/modules/exports/scope'
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
  /** Who is offering the work: name, branding, address, phone, licence. */
  company: CompanyProfile
  /**
   * The number a builder says on the phone.
   *
   * Null only for a project that has never been numbered. The header prints
   * nothing rather than falling back to the tail of the row's cuid, which is
   * what it used to do: "Proposal #: E6PRSR99" is not a reference anybody can
   * read back.
   */
  jobNumber: number | null
  /** Deposit and draws, from the organisation's settings. */
  paymentSchedule: PaymentStage[]
  /** How long a quote stands when the project has no hand-set expiry. */
  proposalValidDays: number
  /** The builder's own terms paragraph, or the default wording. */
  terms: string
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

/**
 * A calendar date, read as the day it was meant to be.
 *
 * The expiry is a date, not a moment. The project form posts `2026-12-25`,
 * which `new Date` reads as midnight UTC, and formatting that in any US
 * timezone prints December 24: a builder who typed the 25th would have watched
 * the proposal tell the customer the pricing died a day early. Only surfaced
 * once the date started being printed at all.
 */
const fmtCalendarDate = (d: Date) =>
  d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

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
  company,
  jobNumber,
  paymentSchedule,
  proposalValidDays,
  terms,
  showInternalNotes = false,
  shapes = [],
}: ProposalDocumentProps) {
  const accent =
    company.brandColor && /^#[0-9a-fA-F]{3,8}$/.test(company.brandColor)
      ? company.brandColor
      : '#0f172a'
  const safeLogo =
    typeof company.logoUrl === 'string' && /^(https?:\/\/|data:image\/)/.test(company.logoUrl)
      ? company.logoUrl
      : null
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

  // The terms paragraph has always said "valid until the expiration date listed
  // above" while the document listed no date at all, so the sentence referred
  // to something that was not there.
  //
  // A hand-set date wins. Otherwise the window runs from when the proposal was
  // last put in front of the customer, not from the moment this page happens to
  // be rendered: an expiry that moves forward every time somebody opens the
  // link is a date that never arrives.
  const issuedAt = project.sharedAt ?? project.updatedAt
  const expiry = proposalExpiry({
    explicit: project.proposalExpiresAt,
    issuedAt,
    validDays: proposalValidDays,
  })
  const expiresAt = fmtCalendarDate(expiry)
  const expired = expiry.getTime() < Date.now()

  const scopeLead = scopeSummary(measurements)
  const scopeItems = scopeOfWork(measurements, quote, selections)
  const notIncluded = exclusions(quote, selections)
  // Percentages against this job's total, not percentages on their own: a
  // customer should not have to work out what 30% of the number in bold is.
  const draws = quote.status === 'PRICED' ? allocateSchedule(paymentSchedule, quote.total) : []
  const acceptedAt = fmtDate(project.proposalAcceptedAt)

  return (
    <article className="proposal-page font-serif text-[11pt] leading-relaxed text-slate-900">
      {/* Header */}
      <header
        className="flex items-start justify-between gap-8 border-b-2 pb-4"
        style={{ borderColor: accent }}
      >
        <div>
          {safeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={safeLogo} alt={company.name} className="mb-2 h-12 w-auto object-contain" />
          ) : null}
          <div className="font-sans text-2xl font-bold tracking-tight" style={{ color: accent }}>
            {company.name}
          </div>
          {/* Who is offering the work. A proposal with no address, no phone
              number and no licence on it is not a document a customer can act
              on, and Florida requires the contractor licence on a pool
              contract. Every line here comes from company settings. */}
          <div className="mt-1 space-y-0.5 font-sans text-xs text-slate-600">
            {company.address ? <div>{company.address}</div> : null}
            {company.phone || company.email ? (
              <div>{[company.phone, company.email].filter(Boolean).join(' · ')}</div>
            ) : null}
            {company.licenseNumber ? (
              <div>
                <span className="text-slate-500">Licence </span>
                {company.licenseNumber}
              </div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm">
          <div>
            <span className="text-slate-500">Date:</span> {today}
          </div>
          <div>
            <span className="text-slate-500">Valid until:</span> {expiresAt}
            {expired ? (
              <span className="ml-1 font-sans text-xs font-semibold uppercase text-red-700">
                Expired
              </span>
            ) : null}
          </div>
          {jobNumber !== null ? (
            <div>
              <span className="text-slate-500">Proposal #:</span> {jobNumber}
            </div>
          ) : null}
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
          {jobNumber !== null ? <Row label="Job #" value={String(jobNumber)} /> : null}
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

      {/* Scope of work. Derived from the same measurements and quote the money
          comes from, so the narrative cannot describe a different pool than the
          table below it. */}
      {scopeLead || scopeItems.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-500">
            Scope of work
          </h2>
          {scopeLead ? <p className="mt-2 text-sm">{scopeLead}</p> : null}
          {scopeItems.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {scopeItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

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

      {/* Payment schedule. Every pool contract has one and this document had
          none, so the customer was shown a five-figure total with no idea when
          any of it was due. */}
      {draws.length > 0 ? (
        <section className="mt-8 break-inside-avoid">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-500">
            Payment schedule
          </h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left font-sans text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Stage</th>
                <th className="py-2 pr-2">Due</th>
                <th className="py-2 pr-2 text-right">Share</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {draws.map((draw, index) => (
                <tr key={`${draw.label}-${index}`} className="border-b border-slate-100">
                  <td className="py-2 pr-2">{draw.label}</td>
                  <td className="py-2 pr-2 text-slate-600">{draw.dueOn ?? ''}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {fmtNumber(draw.percent, 2)}%
                  </td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(draw.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: accent }}>
                <td colSpan={3} className="py-2 text-right font-sans text-sm font-semibold uppercase tracking-wide">
                  Total
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {fmtMoney(draws.reduce((sum, draw) => sum + draw.amount, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      ) : null}

      {/* What the price does not cover. Job-specific first, standing
          exclusions after. */}
      {notIncluded.length > 0 ? (
        <section className="mt-8 break-inside-avoid">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-500">
            Not included
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {notIncluded.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

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
          Terms &amp; disclaimers
        </h3>
        <p className="whitespace-pre-wrap">{terms}</p>
      </section>

      {/* Acceptance. The site plan carries three signature boxes and the
          construction packet two; this is the document that actually gets
          signed and it carried none. */}
      <section className="mt-8 break-inside-avoid border-t-2 pt-4" style={{ borderColor: accent }}>
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-500">
          Acceptance
        </h2>
        <p className="mt-2 text-sm">
          Signing below accepts the scope, the exclusions and the total shown in this proposal
          {jobNumber !== null ? `, proposal #${jobNumber}` : ''}, and authorises {company.name} to
          proceed{draws.length > 0 ? ' on the payment schedule above' : ''}.
        </p>

        {acceptedAt ? (
          <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Accepted electronically by {project.proposalAcceptedName ?? 'the customer'} on{' '}
            {acceptedAt}.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-8">
          <SignatureBox
            role="Customer"
            printedName={customer?.name ?? null}
            signedName={project.proposalAcceptedName}
            signedAt={acceptedAt}
          />
          <SignatureBox
            role={`For ${company.name}`}
            printedName={project.salesperson}
            signedName={null}
            signedAt={null}
          />
        </div>
      </section>

      <footer className="mt-8 border-t border-slate-300 pt-4 text-center text-[10pt] text-slate-500">
        {company.name}
        {company.licenseNumber ? ` · Licence ${company.licenseNumber}` : ''}
        {company.phone ? ` · ${company.phone}` : ''} · Generated {today}
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

/**
 * One signature box: a rule to sign on, a printed name, and a date.
 *
 * When the customer has already accepted through the share link, the name they
 * typed is printed on the rule rather than leaving a blank line beside a green
 * banner saying it was signed.
 */
function SignatureBox({
  role,
  printedName,
  signedName,
  signedAt,
}: {
  role: string
  printedName: string | null
  signedName: string | null
  signedAt: string | null
}) {
  return (
    <div className="text-sm">
      <div className="flex h-10 items-end border-b border-slate-500 pb-1 font-serif italic text-slate-800">
        {signedName ?? ''}
      </div>
      <div className="mt-1 font-sans text-[10pt] uppercase tracking-wide text-slate-500">
        {role} signature
      </div>
      <div className="mt-4 flex h-6 items-end border-b border-slate-400 pb-1">
        {printedName ?? ''}
      </div>
      <div className="mt-1 font-sans text-[10pt] uppercase tracking-wide text-slate-500">
        Printed name
      </div>
      <div className="mt-4 flex h-6 items-end border-b border-slate-400 pb-1">{signedAt ?? ''}</div>
      <div className="mt-1 font-sans text-[10pt] uppercase tracking-wide text-slate-500">Date</div>
    </div>
  )
}
