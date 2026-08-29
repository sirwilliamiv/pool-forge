import type { ReactNode } from 'react'

import {
  EXAMPLE_LINES,
  EXAMPLE_POOL,
  EXAMPLE_TAX_CENTS,
  EXAMPLE_TAX_LABEL,
  EXAMPLE_TOTAL_CENTS,
  money,
  moneyRounded,
} from './example'

// The plates.
//
// Every one of these is drawn, not screenshotted. Two reasons: a PNG of the app
// is stale the day after it is taken, and the brand bible's composition
// patterns want the base plane flat and the inset panel carrying the only
// shadow in the frame, which is a layout decision rather than an image.
//
// The numbers come from `./example`, which every marketing surface reads, so a
// builder who sees the front door and then a product page recognises the same
// job rather than wondering which pool is the real one. Do not type a figure
// into this file; put it there.

/* ------------------------------------------------------------- primitives */

/** The base plane: flat, hairline border, no shadow. */
export function Plate({
  title,
  meta,
  children,
  bodyPad = true,
}: {
  title: string
  meta?: string
  children: ReactNode
  bodyPad?: boolean
}) {
  return (
    <div className="mk-plate">
      <div className="mk-plate__bar">
        <span className="mk-plate__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="mk-label mk-label--ink">{title}</span>
        {meta ? (
          <span className="mk-label" style={{ marginLeft: 'auto' }}>
            {meta}
          </span>
        ) : null}
      </div>
      <div className={bodyPad ? 'mk-plate__body' : undefined}>{children}</div>
    </div>
  )
}

/**
 * Picture-in-picture. One inset panel, overlapping the lower-right corner and
 * breaking the frame edge, carrying the only elevation-2 in the composition.
 */
export function Pip({ base, inset }: { base: ReactNode; inset: ReactNode }) {
  return (
    <div className="mk-pip">
      {base}
      <div className="mk-pip__inset">{inset}</div>
    </div>
  )
}

/** A panel standing on its own rather than overlapping a plate. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

export function Panel({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <>
      <div className="mk-panel__head">
        <span className="mk-label mk-label--ink">{title}</span>
        {meta ? <span className="mk-label">{meta}</span> : null}
      </div>
      <div className="mk-panel__body">{children}</div>
    </>
  )
}

export function Rows({
  rows,
  total,
}: {
  rows: readonly { label: string; value: string }[]
  total?: { label: string; value: string }
}) {
  return (
    <div>
      {rows.map((row) => (
        <div key={row.label} className="mk-row">
          <span className="mk-row__label">{row.label}</span>
          <span className="mk-row__value">{row.value}</span>
        </div>
      ))}
      {total ? (
        <div className="mk-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
          <span className="mk-row__label" style={{ color: 'var(--fg)' }}>
            {total.label}
          </span>
          <span className="mk-row__value mk-row__value--total">{total.value}</span>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ the plan sheet */

/**
 * A pool in plan, dimensioned the way the trade dimensions one.
 *
 * This is the signature image of the whole set: the page is laid out like the
 * drawing the product makes, mono labels on leader lines and all.
 */
export function PlanSheet() {
  return (
    <svg
      viewBox="0 0 760 430"
      role="img"
      aria-label="Plan view of a 32 by 16 foot pool with an attached spa, a step set at the shallow end, travertine coping and a 600 square foot paver deck, dimensioned"
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <defs>
        <pattern id="pf-deck-hatch" width="9" height="9" patternUnits="userSpaceOnUse">
          <path
            d="M0 9 L9 0"
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="1"
            fill="none"
          />
        </pattern>
        <pattern id="pf-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M24 0 L0 0 0 24"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.07"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width="760" height="430" fill="url(#pf-grid)" />

      {/* Property line, dashed, running off two edges the way a lot line does. */}
      <path
        d="M28 22 L732 22 L732 408 L28 408 Z"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeDasharray="10 5 2 5"
      />

      {/* The house, because setbacks are measured from it rather than assumed. */}
      <rect x="28" y="22" width="180" height="86" fill="currentColor" fillOpacity="0.06" />
      <rect
        x="28"
        y="22"
        width="180"
        height="86"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <text x="46" y="70" className="mk-ink-label">
        HOUSE
      </text>

      {/* Deck. */}
      <rect x="96" y="132" width="536" height="252" rx="10" fill="url(#pf-deck-hatch)" />
      <rect
        x="96"
        y="132"
        width="536"
        height="252"
        rx="10"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.25"
      />

      {/* Coping band. */}
      <rect
        x="168"
        y="176"
        width="392"
        height="164"
        rx="12"
        fill="var(--bg)"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1"
      />

      {/* Water. */}
      <rect
        x="180"
        y="188"
        width="368"
        height="140"
        rx="8"
        fill="var(--water)"
        fillOpacity="0.18"
        stroke="var(--water)"
        strokeWidth="1.5"
      />

      {/* Step set at the shallow end. */}
      <path
        d="M180 196 h44 v124 h-44"
        fill="none"
        stroke="var(--water)"
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />
      <path
        d="M180 212 h30 M180 240 h30 M180 268 h30 M180 296 h30"
        stroke="var(--water)"
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />

      {/* Spa, spilling into the pool at the deep end. */}
      <circle
        cx="580"
        cy="258"
        r="46"
        fill="var(--water)"
        fillOpacity="0.28"
        stroke="var(--water)"
        strokeWidth="1.5"
      />
      <circle cx="580" cy="258" r="32" fill="none" stroke="var(--water)" strokeOpacity="0.5" />
      <text x="558" y="318" className="mk-ink-label">
        SPA
      </text>

      {/* Overall width dimension, top. */}
      <g>
        <path d="M180 158 h368" className="mk-ink-thin" strokeWidth="1" />
        <path d="M180 152 v12 M548 152 v12" className="mk-ink-thin" strokeWidth="1" />
        <rect x="326" y="146" width="76" height="18" fill="var(--bg)" />
        <text x="364" y="159" textAnchor="middle" className="mk-ink-label mk-ink-label--ink">
          32&apos;-0&quot;
        </text>
      </g>

      {/* Overall depth dimension, left. */}
      <g>
        <path d="M150 188 v140" className="mk-ink-thin" strokeWidth="1" />
        <path d="M144 188 h12 M144 328 h12" className="mk-ink-thin" strokeWidth="1" />
        <rect x="124" y="249" width="52" height="18" fill="var(--bg)" />
        <text x="150" y="262" textAnchor="middle" className="mk-ink-label mk-ink-label--ink">
          16&apos;-0&quot;
        </text>
      </g>

      {/* Depth marks in the water, shallow to deep, which is where a plan puts
          them and is also clear of the panel that overlaps the lower right. */}
      <g>
        <path d="M252 202 v14" className="mk-ink-thin" strokeWidth="1" />
        <text x="260" y="214" className="mk-ink-label mk-ink-label--ink">
          3&apos;-6&quot;
        </text>
      </g>
      <g>
        <path d="M400 202 v14" className="mk-ink-thin" strokeWidth="1" />
        <text x="408" y="214" className="mk-ink-label mk-ink-label--ink">
          8&apos;-0&quot;
        </text>
      </g>

      {/* Setback, measured from the house wall that is actually on the drawing. */}
      <g>
        <path d="M118 108 v24" className="mk-ink-thin" strokeWidth="1" />
        <path d="M112 108 h12 M112 132 h12" className="mk-ink-thin" strokeWidth="1" />
        <text x="130" y="124" className="mk-ink-label">
          SETBACK 7&apos;-6&quot;
        </text>
      </g>

      {/* North arrow. */}
      <g transform="translate(694 372)">
        <path d="M0 -20 L7 8 L0 2 L-7 8 Z" fill="currentColor" fillOpacity="0.55" />
        <text x="0" y="24" textAnchor="middle" className="mk-ink-label">
          N
        </text>
      </g>
    </svg>
  )
}

/* -------------------------------------------------------- section drawing */

/** The same scene under a different camera: pool in section, with grade. */
export function SectionSheet() {
  return (
    <svg
      viewBox="0 0 620 260"
      role="img"
      aria-label="Section through the pool showing existing grade, finished grade, the shell from three feet six inches down to eight feet, and the cut and fill either side"
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {/* Existing grade, dashed. Finished grade, solid. Cut and fill are the
          area between them, and they are reported apart rather than netted. */}
      <path
        d="M0 96 Q150 70 300 92 T620 78"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.25"
        strokeDasharray="6 4"
      />
      <path d="M0 100 L620 100" className="mk-ink-line" strokeWidth="1.5" fill="none" />

      {/* Fill, left. */}
      <path d="M0 96 Q150 70 300 92 L300 100 L0 100 Z" fill="var(--water)" fillOpacity="0.1" />
      <text x="70" y="88" className="mk-ink-label">
        FILL 14 CY
      </text>

      {/* Cut, right. */}
      <path d="M300 92 Q460 84 620 78 L620 100 L300 100 Z" fill="currentColor" fillOpacity="0.08" />
      <text x="470" y="94" className="mk-ink-label">
        CUT 118 CY
      </text>

      {/* Shell. */}
      <path
        d="M96 100 L96 138 L150 152 L420 200 L470 200 L500 168 L500 100"
        fill="var(--water)"
        fillOpacity="0.16"
        stroke="var(--water)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      {/* Waterline. */}
      <path d="M96 112 L500 112" stroke="var(--water)" strokeWidth="1" strokeDasharray="4 4" />

      <g>
        <path d="M78 100 v38" className="mk-ink-thin" strokeWidth="1" />
        <path d="M72 100 h12 M72 138 h12" className="mk-ink-thin" strokeWidth="1" />
        <text x="16" y="124" className="mk-ink-label mk-ink-label--ink">
          3&apos;-6&quot;
        </text>
      </g>
      <g>
        <path d="M520 100 v100" className="mk-ink-thin" strokeWidth="1" />
        <path d="M514 100 h12 M514 200 h12" className="mk-ink-thin" strokeWidth="1" />
        <text x="532" y="154" className="mk-ink-label mk-ink-label--ink">
          8&apos;-0&quot;
        </text>
      </g>

      <text x="16" y="228" className="mk-ink-label">
        EXISTING GRADE · DASHED
      </text>
      <text x="230" y="228" className="mk-ink-label">
        FINISHED GRADE · SOLID
      </text>
    </svg>
  )
}

/* -------------------------------------------------------------- the panels */

/** What the measurement engine derives, the moment the shape changes. */
export function MeasurementsPanel() {
  return (
    <Panel title="Measurements" meta="Live">
      <Rows
        rows={[
          { label: 'Surface area', value: `${EXAMPLE_POOL.surfaceArea} sq ft` },
          { label: 'Perimeter', value: `${EXAMPLE_POOL.perimeter} lf` },
          { label: 'Volume', value: `${EXAMPLE_POOL.gallons.toLocaleString('en-US')} gal` },
          { label: 'Deck area', value: `${EXAMPLE_POOL.deckArea} sq ft` },
          { label: 'Coping', value: `${EXAMPLE_POOL.perimeter} lf` },
        ]}
      />
    </Panel>
  )
}

/**
 * The quote, grouped the way the price book is grouped.
 *
 * The total leads rather than closing, because the panel that overlaps the
 * lower-right corner of this plate would otherwise land squarely on the one
 * number a builder came to look at.
 */
export function QuotePlate() {
  return (
    <Plate title="Quote · Ridgeline residence" meta="Price book v4">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          paddingBottom: '0.875rem',
          marginBottom: '0.25rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="mk-label">Total, with tax</span>
        <span
          style={{
            fontSize: 'var(--size-title3)',
            letterSpacing: 'var(--ls-standard)',
            fontWeight: 500,
          }}
        >
          {money(EXAMPLE_TOTAL_CENTS)}
        </span>
      </div>
      <Rows
        rows={[
          ...EXAMPLE_LINES.map((line) => ({
            label: `${line.label} · ${line.qty}`,
            value: money(line.cents),
          })),
          { label: EXAMPLE_TAX_LABEL, value: money(EXAMPLE_TAX_CENTS) },
        ]}
      />
    </Plate>
  )
}

/** A proposal, filed as it was sent rather than re-rendered later. */
export function SentPanel() {
  return (
    <Panel title="Proposal" meta="Accepted">
      <Rows
        rows={[
          { label: 'Sent', value: '12 Aug 2026' },
          { label: 'Accepted by', value: 'D. Alvarez' },
          { label: 'Priced from', value: 'Price book v4' },
        ]}
      />
      <p className="mk-caption" style={{ marginTop: '0.625rem', fontSize: '0.8125rem' }}>
        Filed as the file that went out.
      </p>
    </Panel>
  )
}

/** The jobs list, with the six statuses a job actually moves through. */
export function JobsPlate() {
  const jobs = [
    { name: 'Ridgeline residence', who: 'D. Alvarez', status: 'Proposal sent', value: moneyRounded(EXAMPLE_TOTAL_CENTS) },
    { name: 'Camden pool and spa', who: 'M. Okafor', status: 'Approved', value: '$81,400' },
    { name: 'Harbour Way lanai', who: 'S. Whitfield', status: 'Construction ready', value: '$122,850' },
    { name: 'Fairhaven rebuild', who: 'T. Brennan', status: 'Draft', value: '—' },
    { name: 'Willow Court screen', who: 'A. Petrov', status: 'Ready for review', value: '$18,220' },
  ]
  return (
    <Plate title="Jobs" meta="5 open">
      <div>
        {jobs.map((job) => (
          <div key={job.name} className="mk-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: 'var(--fg)' }}>{job.name}</span>
              <span className="mk-label" style={{ textTransform: 'none' }}>
                {job.who} · {job.status}
              </span>
            </span>
            <span className="mk-row__value">{job.value}</span>
          </div>
        ))}
      </div>
    </Plate>
  )
}

/** The audit log: what a person did, not what a row did. */
export function AuditPanel() {
  return (
    <Panel title="Activity" meta="Audit log">
      <Rows
        rows={[
          { label: 'Deck material set to paver', value: '09:14' },
          { label: 'Heater removed from quote', value: '09:31' },
          { label: 'Checklist run · 2 warnings', value: '10:02' },
          { label: 'Proposal exported', value: '10:09' },
        ]}
      />
      <p className="mk-caption" style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
        Every command writes a row, whether it succeeded or failed.
      </p>
    </Panel>
  )
}

/** The checklist that stands between a draft and a send. */
export function ChecklistPlate() {
  const rows = [
    { state: 'pass', text: 'Customer name and address' },
    { state: 'pass', text: 'Pool depth ordered shallow to deep' },
    { state: 'warn', text: 'Proposal expiry not set' },
    { state: 'error', text: 'Heater on the drawing has no fuel type' },
    { state: 'pass', text: 'Deck material chosen' },
    { state: 'pass', text: 'Quote total is not zero' },
  ] as const

  const glyph = { pass: '✓', warn: '!', error: '×' } as const
  const colour = {
    pass: 'var(--fg-muted)',
    warn: 'var(--brand-orange)',
    error: 'var(--brand-red)',
  } as const

  return (
    <Plate title="Checklist" meta="17 rules">
      <div>
        {rows.map((row) => (
          <div key={row.text} className="mk-row">
            <span style={{ display: 'flex', gap: '0.625rem', alignItems: 'baseline' }}>
              <span
                className="mk-row__value"
                style={{ color: colour[row.state], width: '0.75rem' }}
                aria-hidden
              >
                {glyph[row.state]}
              </span>
              <span style={{ color: row.state === 'pass' ? 'var(--fg-muted)' : 'var(--fg)' }}>
                {row.text}
              </span>
            </span>
            {row.state !== 'pass' ? (
              <span className="mk-row__value" style={{ color: 'var(--fg-faint)' }}>
                JUMP TO
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </Plate>
  )
}

/** Column mapping, the step that makes a builder's own spreadsheet usable. */
export function ImportPlate() {
  const cols = [
    { from: 'DESCRIPTION', to: 'Name' },
    { from: 'UOM', to: 'Unit' },
    { from: 'COST EA', to: 'Unit cost' },
    { from: 'SELL', to: 'Retail price' },
    { from: 'GROUP', to: 'Category' },
  ]
  return (
    <Plate title="Import price book" meta="pricing-2026.xlsx">
      <div>
        {cols.map((col) => (
          <div key={col.from} className="mk-row">
            <span className="mk-row__value" style={{ color: 'var(--fg-muted)' }}>
              {col.from}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="mk-label">→</span>
              <span style={{ color: 'var(--fg)', fontSize: 'var(--size-body)' }}>{col.to}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mk-caption" style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
        412 rows read. Every price checked against the file before the version saves.
      </p>
    </Plate>
  )
}

/** The four documents that come out of one drawing. */
export function DocumentsPlate() {
  const docs = [
    { name: 'Customer proposal', meta: 'Letter · branded' },
    { name: 'Construction packet', meta: '11×17 · dense' },
    { name: 'Site plan', meta: 'Setbacks · lot line' },
    { name: 'Screen enclosure RFQ', meta: 'For the vendor' },
  ]
  return (
    <Plate title="Documents" meta="One drawing">
      <div>
        {docs.map((doc) => (
          <div key={doc.name} className="mk-row">
            <span style={{ color: 'var(--fg)' }}>{doc.name}</span>
            <span className="mk-row__value">{doc.meta}</span>
          </div>
        ))}
      </div>
    </Plate>
  )
}

/** What the customer does before you drive out. */
export function IntakePlate() {
  return (
    <Plate title="Intake link" meta="Sent to the customer">
      <Rows
        rows={[
          { label: 'Back yard, from the patio', value: 'PHOTO · 3.1 MB' },
          { label: 'Back yard, from the fence', value: 'PHOTO · 2.7 MB' },
          { label: 'Sketch on graph paper', value: 'PHOTO · 1.9 MB' },
          { label: 'Survey', value: 'PDF · 480 KB' },
        ]}
      />
      <p className="mk-caption" style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
        No account, no app. A link they open on the phone that took the photos.
      </p>
    </Plate>
  )
}

/** Roles, which decide who may move a price. */
export function TeamPanel() {
  return (
    <Panel title="Team" meta="3 people">
      <Rows
        rows={[
          { label: 'Dana Alvarez', value: 'OWNER' },
          { label: 'Marcus Okafor', value: 'ADMIN' },
          { label: 'Sofia Whitfield', value: 'MEMBER' },
        ]}
      />
      <p className="mk-caption" style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
        Nobody can hand out access above their own, and an organisation always keeps at
        least one owner.
      </p>
    </Panel>
  )
}

/** The version rack: many designs against one job. */
export function VersionsPlate() {
  const versions = [
    { name: 'Scheme A · rectangle', who: 'Dana Alvarez', total: moneyRounded(EXAMPLE_TOTAL_CENTS), active: true },
    { name: 'Scheme B · with spa', who: 'Dana Alvarez', total: '$58,410', active: false },
    { name: 'Scheme C · freeform, smaller deck', who: 'Marcus Okafor', total: '$41,880', active: false },
  ]
  return (
    <Plate title="Designs on this job" meta="3 of 40">
      <div>
        {versions.map((v) => (
          <div key={v.name} className="mk-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: 'var(--fg)' }}>
                {v.name}
                {v.active ? (
                  <span className="mk-label" style={{ marginLeft: '0.5rem' }}>
                    ACTIVE
                  </span>
                ) : null}
              </span>
              <span className="mk-label" style={{ textTransform: 'none' }}>
                {v.who}
              </span>
            </span>
            <span className="mk-row__value">{v.total}</span>
          </div>
        ))}
      </div>
    </Plate>
  )
}
