/** @vitest-environment jsdom */

// The proposal, judged as the deliverable rather than as a page.
//
// A product owner drove the running app and would not ship what came out: no
// signature block on the one document that gets signed, no payment schedule, no
// company address or licence number, a terms paragraph promising an expiration
// date the document never printed, and a proposal number that was the tail of
// the row's cuid.
//
// Every assertion below is one of those, checked against the rendered document
// rather than against the props that went in.

import { render, screen, within } from '@testing-library/react'
import { PriceCategory, type Customer, type Project } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { ProposalDocument } from '@/components/exports/ProposalDocument'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import type { QuoteSummary } from '@/modules/pricing/engine'
import {
  DEFAULT_PROPOSAL_TERMS,
  SUGGESTED_PAYMENT_SCHEDULE,
  type CompanyProfile,
  type PaymentStage,
} from '@/modules/organization/company'

const COMPANY: CompanyProfile = {
  name: 'Blue Water Pools',
  logoUrl: null,
  brandColor: '#0284c7',
  address: '1200 Gulf Blvd, Suite 4, Tampa FL 33606',
  phone: '813-555-0180',
  email: 'office@bluewater.test',
  licenseNumber: 'CPC1457893',
}

const MEASUREMENTS: MeasurementSummary = {
  poolSurfaceArea: 300,
  poolPerimeter: 74,
  poolGallons: 13500,
  poolWettedArea: 596,
  poolLengthFt: 25,
  poolWidthFt: 12,
  poolDepthShallow: 3,
  poolDepthDeep: 5,
  poolAvgDepth: 4,
  deckArea: 770,
  copingLinearFeet: 74,
  decoDrainLinearFeet: 0,
  benchLinearFeet: 0,
  featureCount: 0,
  spaCount: 0,
  lightCount: 4,
  waterFeatureCount: 0,
  hasPool: true,
  hasDeck: true,
  cutYards: 0,
  fillYards: 0,
  maxSlopePct: 0,
}

const QUOTE: QuoteSummary = {
  status: 'PRICED',
  lineItems: [
    {
      itemId: 'pool-1',
      name: 'Pool Base — Wetted Area',
      category: PriceCategory.POOL,
      source: 'poolSurfaceArea',
      quantity: 300,
      unitPrice: 85,
      total: 25500,
    },
    {
      itemId: 'deck-1',
      name: 'Concrete Deck',
      category: PriceCategory.DECK,
      source: 'deckArea',
      quantity: 770,
      unitPrice: 14,
      total: 10780,
    },
    {
      itemId: 'equip-1',
      name: 'Variable Speed Pump',
      category: PriceCategory.EQUIPMENT,
      source: 'required',
      quantity: 1,
      unitPrice: 1750,
      total: 1750,
    },
    {
      itemId: 'coping-1',
      name: 'Travertine Coping',
      category: PriceCategory.COPING,
      source: 'copingLinearFeet',
      quantity: 74,
      unitPrice: 42,
      total: 3108,
    },
    {
      itemId: 'light-1',
      name: 'LED Pool Light',
      category: PriceCategory.LIGHTING,
      source: 'lightCount',
      quantity: 4,
      unitPrice: 450,
      total: 1800,
    },
  ],
  subtotal: 42938,
  taxRatePct: 6,
  taxAmount: 2576,
  total: 45514,
  unpriced: [],
}

function makeProject(overrides: Partial<Project> = {}): Project {
  const base = {
    id: 'cmt52jx17001fsbupe6prsr99',
    orgId: 'org-1',
    customerId: 'cus-1',
    name: 'Alvarez Residence',
    jobNumber: 1042,
    salesperson: 'Ray Delgado',
    designer: 'Nina Croft',
    status: 'DRAFT',
    jurisdiction: null,
    parcelId: null,
    proposalExpiresAt: null,
    internalNotes: null,
    poolFields: {},
    shareToken: null,
    sharedAt: new Date('2026-08-01T12:00:00Z'),
    proposalAcceptedAt: null,
    proposalAcceptedName: null,
    createdAt: new Date('2026-07-01T12:00:00Z'),
    updatedAt: new Date('2026-08-01T12:00:00Z'),
    ...overrides,
  }
  // Cast rather than a fully-typed literal: this file cares about what the
  // document prints, and a column added to Project by unrelated work should not
  // break it.
  return base as unknown as Project
}

const CUSTOMER = {
  id: 'cus-1',
  orgId: 'org-1',
  name: 'Mrs Alvarez',
  email: 'maria.alvarez@example.com',
  phone: '813-555-0142',
  address: '4127 Bayshore Ct, Tampa FL 33611',
  notes: null,
} as unknown as Customer

const SELECTIONS = {
  heaterSelected: true,
  saltSystemSelected: true,
  screenSelected: false,
  lightingQuantity: 4,
}

function renderProposal(overrides: {
  project?: Partial<Project>
  paymentSchedule?: PaymentStage[]
  terms?: string
  jobNumber?: number | null
  quote?: QuoteSummary
} = {}) {
  return render(
    <ProposalDocument
      project={makeProject(overrides.project)}
      customer={CUSTOMER}
      measurements={MEASUREMENTS}
      quote={overrides.quote ?? QUOTE}
      selections={SELECTIONS}
      company={COMPANY}
      jobNumber={overrides.jobNumber === undefined ? 1042 : overrides.jobNumber}
      paymentSchedule={overrides.paymentSchedule ?? SUGGESTED_PAYMENT_SCHEDULE}
      proposalValidDays={30}
      terms={overrides.terms ?? DEFAULT_PROPOSAL_TERMS}
      shapes={[]}
    />,
  )
}

describe('the proposal says who is offering the work', () => {
  it('prints the company address, phone, email and licence number in the header', () => {
    const { container } = renderProposal()
    // Asserted inside the header specifically. The footer repeats the licence,
    // so a document-wide search would still pass with the header line deleted.
    const header = container.querySelector('header')
    expect(header).toBeTruthy()
    const head = within(header as HTMLElement)
    expect(head.getByText(/1200 Gulf Blvd, Suite 4, Tampa FL 33606/)).toBeInTheDocument()
    expect(head.getByText(/813-555-0180/)).toBeInTheDocument()
    expect(head.getByText(/office@bluewater\.test/)).toBeInTheDocument()
    // Florida requires the contractor licence on a pool contract.
    expect(head.getByText(/CPC1457893/)).toBeInTheDocument()
  })
})

describe('the proposal has a reference number a person can say out loud', () => {
  it('prints the job number', () => {
    renderProposal()
    expect(screen.getByText('Proposal #:').parentElement?.textContent).toContain('1042')
  })

  it('never prints the row id', () => {
    // "Proposal #: E6PRSR99" was the last eight characters of the cuid.
    const { container } = renderProposal()
    expect(container.textContent).not.toContain('cmt52jx17001fsbupe6prsr99')
    expect(container.textContent).not.toContain('E6PRSR99')
  })

  it('prints nothing rather than a fallback when a project has no number', () => {
    renderProposal({ jobNumber: null })
    expect(screen.queryByText('Proposal #:')).toBeNull()
  })
})

describe('the proposal prints the date its own terms refer to', () => {
  it('lists an expiration date', () => {
    renderProposal()
    // sharedAt is 2026-08-01, the window is 30 days.
    expect(screen.getByText('Valid until:').parentElement?.textContent).toContain(
      'August 31, 2026',
    )
  })

  it('uses a date somebody set by hand over the organisation window', () => {
    // Stored the way the project form stores it: the calendar day the builder
    // typed, as midnight UTC. Formatted in local time this printed December 24,
    // so the proposal told the customer the pricing died a day early.
    renderProposal({ project: { proposalExpiresAt: new Date('2026-12-25T00:00:00Z') } })
    expect(screen.getByText('Valid until:').parentElement?.textContent).toContain(
      'December 25, 2026',
    )
  })

  it('says so when the pricing no longer stands', () => {
    renderProposal({ project: { proposalExpiresAt: new Date('2020-01-01T00:00:00Z') } })
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('carries the terms paragraph the builder wrote', () => {
    renderProposal({ terms: 'Bring your own water.' })
    expect(screen.getByText('Bring your own water.')).toBeInTheDocument()
  })
})

describe('the proposal says when the money is due', () => {
  it('prints the payment schedule in dollars, not just percentages', () => {
    renderProposal()
    const heading = screen.getByText('Payment schedule')
    const table = heading.parentElement?.querySelector('table')
    expect(table).toBeTruthy()
    const rows = within(table as HTMLElement)
    expect(rows.getByText('Deposit')).toBeInTheDocument()
    // 10% of $45,514.
    expect(rows.getByText('$4,551')).toBeInTheDocument()
    expect(rows.getByText('On signing')).toBeInTheDocument()
  })

  it('makes the schedule add up to the total the customer is quoted', () => {
    renderProposal()
    const table = screen.getByText('Payment schedule').parentElement?.querySelector('table')
    const footer = table?.querySelector('tfoot')
    expect(footer?.textContent).toContain('$45,514')
  })

  it('prints no schedule at all when the builder has set none', () => {
    renderProposal({ paymentSchedule: [] })
    expect(screen.queryByText('Payment schedule')).toBeNull()
  })
})

describe('the proposal can actually be signed', () => {
  it('has a signature block for both sides', () => {
    renderProposal()
    expect(screen.getByText('Acceptance')).toBeInTheDocument()
    expect(screen.getByText('Customer signature')).toBeInTheDocument()
    expect(screen.getByText('For Blue Water Pools signature')).toBeInTheDocument()
    expect(screen.getAllByText('Printed name')).toHaveLength(2)
    expect(screen.getAllByText('Date')).toHaveLength(2)
  })

  it('prints the name of a customer who already accepted through the link', () => {
    renderProposal({
      project: {
        proposalAcceptedName: 'Dana Reyes',
        proposalAcceptedAt: new Date('2026-08-22T12:00:00Z'),
      },
    })
    expect(screen.getByText(/Accepted electronically by Dana Reyes/)).toBeInTheDocument()
  })
})

describe('the proposal states the scope and the exclusions', () => {
  it('describes the job in the numbers the rest of the document prints', () => {
    renderProposal()
    expect(screen.getByText('Scope of work')).toBeInTheDocument()
    expect(screen.getByText(/25 ft × 12 ft swimming pool/)).toBeInTheDocument()
    expect(screen.getByText(/770 sq ft, placed and finished/)).toBeInTheDocument()
  })

  it('names what this particular job leaves out', () => {
    renderProposal()
    expect(screen.getByRole('heading', { name: 'Not included' })).toBeInTheDocument()
    // Screen enclosure was not ticked on this job.
    expect(screen.getByText('Screen enclosure or cage.')).toBeInTheDocument()
  })

  it('never lists something the customer is buying as an exclusion', () => {
    const { container } = renderProposal()
    // The heater IS included on this job, so the exclusions must not mention it.
    expect(container.textContent).not.toContain('No heater is included at this price')
    expect(container.textContent).not.toContain('Salt chlorination. Sanitisation')
  })

  it('carries the scope the quote could not price into the exclusions', () => {
    const quote: QuoteSummary = {
      ...QUOTE,
      unpriced: [
        {
          category: PriceCategory.EARTHWORK,
          scope: 'category',
          label: 'Earthwork',
          quantity: 42,
          unit: 'cu yd',
          reason: 'No earthwork item in the price book',
        },
      ],
    }
    renderProposal({ quote })
    expect(screen.getByText(/Earthwork \(42 cu yd\)/)).toBeInTheDocument()
  })
})
