// What every product in this market actually does, in one place.
//
// This exists because the same facts are about to appear in two forms: a
// feature comparison a founder reasons from, and public pages that name other
// companies. Those must not drift, because the second one is a public claim
// about somebody else's product and being wrong in public is a different kind
// of wrong from being wrong in a spreadsheet.
//
// So there is one record per product, every entry carries where it came from,
// and "we do not know" is a value rather than a blank that renders as a cross.
// `docs/competitive-analysis.md` is the long-form research this is distilled
// from; when the two disagree the dossier is right and this file is stale.

/**
 * How well a product does a thing.
 *
 * `unknown` is the important one. A comparison page that prints a cross next to
 * a competitor's name for something nobody checked is a false statement about
 * a named company, and the fact that it was an omission rather than a lie does
 * not help. Unknown renders as unknown.
 */
export type Support = 'yes' | 'partial' | 'no' | 'unknown'

export interface Capability {
  support: Support
  /** One line a reader can act on. Not marketing copy, and never a claim wider than the evidence. */
  note?: string
}

export type FeatureKey =
  | 'browserAuthoring'
  | 'customerOnPhone'
  | 'pool3d'
  | 'photoreal'
  | 'augmentedReality'
  | 'priceBook'
  | 'priceFromDrawing'
  | 'quoteVersioning'
  | 'changeApproval'
  | 'financing'
  | 'customerProposal'
  | 'eSignature'
  | 'storedSentCopy'
  | 'constructionDrawings'
  | 'permitDocuments'
  | 'scheduling'
  | 'crm'
  | 'serviceRouting'
  | 'teamRoles'
  | 'poolSpecific'

export interface Feature {
  key: FeatureKey
  label: string
  /** Why a pool builder would care. Written for them, not for us. */
  matters: string
  group: 'Design' | 'Money' | 'Documents' | 'Operations'
}

export const FEATURES: readonly Feature[] = [
  { key: 'browserAuthoring', group: 'Design', label: 'Designs in a browser',
    matters: 'No Windows box with a gaming card in the office, and nothing to install on a laptop you take to a kitchen table.' },
  { key: 'customerOnPhone', group: 'Design', label: 'Customer can view on their phone',
    matters: 'The person paying looks at it on the sofa that evening, not over your shoulder in their driveway.' },
  { key: 'pool3d', group: 'Design', label: '3D pool model',
    matters: 'A shape a homeowner can turn around beats a plan view they have to interpret.' },
  { key: 'photoreal', group: 'Design', label: 'Photorealistic rendering',
    matters: 'What sells a $90,000 job to somebody who has never bought one.' },
  { key: 'augmentedReality', group: 'Design', label: 'Augmented reality on site',
    matters: 'Standing in the actual yard and seeing the actual pool.' },

  { key: 'priceBook', group: 'Money', label: 'Your own price book',
    matters: 'Your costs and your margins, not a vendor catalogue.' },
  { key: 'priceFromDrawing', group: 'Money', label: 'Priced from the drawing',
    matters: 'Widen the pool and the number moves. No second pass in a spreadsheet, and no chance the two disagree.' },
  { key: 'quoteVersioning', group: 'Money', label: 'Versioned prices',
    matters: 'A price rise cannot silently rewrite a quote somebody already signed.' },
  { key: 'changeApproval', group: 'Money', label: 'Reviewed price changes',
    matters: 'One person keeps the price book and everybody else asks. That is how it already works, in text messages.' },
  { key: 'financing', group: 'Money', label: 'Customer financing',
    matters: 'Monthly payment turns a flinch into a signature.' },

  { key: 'customerProposal', group: 'Documents', label: 'Customer proposal',
    matters: 'The document that gets signed.' },
  { key: 'eSignature', group: 'Documents', label: 'Accepted online',
    matters: 'They accept from the sofa instead of you driving back out.' },
  { key: 'storedSentCopy', group: 'Documents', label: 'Keeps what was sent',
    matters: 'What did we send them in March, exactly. A re-render of today is not an answer.' },
  { key: 'constructionDrawings', group: 'Documents', label: 'Construction drawings',
    matters: 'What the crew builds from.' },
  { key: 'permitDocuments', group: 'Documents', label: 'Permit documents',
    matters: 'A rejected packet costs weeks of schedule.' },

  { key: 'scheduling', group: 'Operations', label: 'Scheduling and jobs',
    matters: 'Running the build after it is sold.' },
  { key: 'crm', group: 'Operations', label: 'Customer records',
    matters: 'Who asked, when, and what you quoted them.' },
  { key: 'serviceRouting', group: 'Operations', label: 'Service and routes',
    matters: 'Recurring maintenance work, which is a different business from building.' },
  { key: 'teamRoles', group: 'Operations', label: 'Team and permissions',
    matters: 'Six salespeople quoting from one price list, with one person allowed to change it.' },
  { key: 'poolSpecific', group: 'Operations', label: 'Built for pools',
    matters: 'A generic construction tool does not know what coping is, so somebody has to teach it every time.' },
]

export interface Product {
  slug: string
  name: string
  vendor?: string
  /** One sentence, fair enough that their own team would not object to it. */
  summary: string
  /** As published. Null when they will not say without a demo call, which is itself worth knowing. */
  pricing: string | null
  site: string
  /** When these facts were last checked against the source. */
  verified: string
  capabilities: Partial<Record<FeatureKey, Capability>>
  /** Where this product genuinely wins. Written honestly, because a comparison nobody believes sells nothing. */
  strengths: readonly string[]
  /** Where a pool builder would feel the gap. */
  gaps: readonly string[]
}

const UNKNOWN: Capability = { support: 'unknown' }

/**
 * Pool Forge, described as it is today rather than as intended.
 *
 * Kept honest deliberately: this record feeds public pages, and a builder who
 * arrives expecting what it says and finds something else is lost in the first
 * ten minutes. Anything in flight is `no` or `partial` until it ships.
 */
export const POOL_FORGE: Product = {
  slug: 'pool-forge',
  name: 'Pool Forge',
  summary:
    'Draw the pool in a browser and watch your own prices follow the shape, then send the proposal the customer signs.',
  pricing: null,
  site: 'https://poolforge.app',
  verified: '2026-08-28',
  capabilities: {
    browserAuthoring: { support: 'yes', note: 'Nothing to install. Works on the laptop you already carry.' },
    customerOnPhone: { support: 'yes', note: 'A share link the customer opens and accepts on their phone.' },
    pool3d: { support: 'yes', note: 'Real 3D you can orbit, with sun study, at massing fidelity.' },
    photoreal: { support: 'no', note: 'Honest gap. The render is clear, not photographic.' },
    augmentedReality: { support: 'no' },
    priceBook: { support: 'yes', note: 'Yours, imported from the spreadsheet you already keep.' },
    priceFromDrawing: { support: 'yes', note: 'Widen the pool and the quote moves in the same breath.' },
    quoteVersioning: { support: 'yes', note: 'A sent proposal keeps the prices it was sent with.' },
    changeApproval: { support: 'partial', note: 'The review model is built and the screens are not finished.' },
    financing: { support: 'no' },
    customerProposal: { support: 'yes' },
    eSignature: { support: 'yes', note: 'Accepted from the share link, recorded against the job.' },
    storedSentCopy: { support: 'yes', note: 'The document is filed as sent, not re-rendered later.' },
    constructionDrawings: { support: 'yes' },
    permitDocuments: { support: 'partial', note: 'Site plan with setbacks. It refuses to call itself submittable until it is.' },
    scheduling: { support: 'no' },
    crm: { support: 'partial', note: 'Customer records against jobs. Not a sales pipeline.' },
    serviceRouting: { support: 'no' },
    teamRoles: { support: 'partial', note: 'Roles decide who may change the price book. Invites are in progress.' },
    poolSpecific: { support: 'yes' },
  },
  strengths: [
    'The drawing and the price are the same thing, so they cannot disagree.',
    'Runs in a browser, including the customer\'s.',
    'A sent proposal is filed as sent and cannot be quietly re-priced.',
  ],
  gaps: [
    'Not photorealistic. If a render wins the job, this is not the tool yet.',
    'No scheduling, no service routing, no financing.',
    'Early, and deliberately invite only.',
  ],
}

/**
 * Everybody else.
 *
 * Distilled from `docs/competitive-analysis.md`, which carries the evidence and
 * the reasoning. Anything not established there is `unknown` here rather than
 * guessed, and two entries are deliberately thin pending research.
 */
export const COMPETITORS: readonly Product[] = [
  {
    slug: 'pool-studio',
    name: 'Pool Studio',
    vendor: 'Structure Studios',
    summary: 'The incumbent 3D pool design tool, and the render bar the whole market is measured against.',
    pricing: '$147/mo, or $125/mo annual, plus $95 setup',
    site: 'https://www.structurestudios.com',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'no', note: 'Windows, and it wants a real graphics card.' },
      customerOnPhone: { support: 'no' },
      pool3d: { support: 'yes' },
      photoreal: { support: 'yes', note: 'The strongest render in the category.' },
      augmentedReality: { support: 'partial', note: 'Through YARD, a separate iPad add-on.' },
      priceBook: { support: 'partial', note: 'Takeoffs and quantities.' },
      priceFromDrawing: { support: 'no', note: 'Quantities come out. Money does not.' },
      quoteVersioning: UNKNOWN,
      changeApproval: { support: 'no' },
      financing: { support: 'no' },
      customerProposal: { support: 'partial' },
      eSignature: { support: 'no' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'yes' },
      permitDocuments: { support: 'partial' },
      scheduling: { support: 'no' },
      crm: { support: 'no' },
      serviceRouting: { support: 'no' },
      teamRoles: UNKNOWN,
      poolSpecific: { support: 'yes' },
    },
    strengths: ['Renders that sell jobs.', 'Deep pool-specific modelling.', 'Years of trust in the trade.'],
    gaps: ['Windows only, so the design lives on one machine.', 'Takeoffs but no priced quote.', 'The customer cannot open it.'],
  },
  {
    slug: 'vip3d',
    name: 'Vip3D',
    vendor: 'Structure Studios',
    summary: 'Pool Studio with the whole backyard, aimed at design-build firms selling the outdoor room.',
    pricing: '$197/mo, or $167/mo annual',
    site: 'https://www.structurestudios.com',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'no' },
      customerOnPhone: { support: 'no', note: 'VR export, not a browser link.' },
      pool3d: { support: 'yes' },
      photoreal: { support: 'yes' },
      augmentedReality: { support: 'partial' },
      priceBook: { support: 'partial' },
      priceFromDrawing: { support: 'no' },
      quoteVersioning: UNKNOWN,
      changeApproval: { support: 'no' },
      financing: { support: 'no' },
      customerProposal: { support: 'partial' },
      eSignature: { support: 'no' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'yes' },
      permitDocuments: { support: 'partial' },
      scheduling: { support: 'no' },
      crm: { support: 'no' },
      serviceRouting: { support: 'no' },
      teamRoles: UNKNOWN,
      poolSpecific: { support: 'yes' },
    },
    strengths: ['Highest render fidelity in the category.', 'Whole-backyard scope, not just the pool.'],
    gaps: ['Windows only.', 'No priced quote from the design.', 'Most expensive seat in the category.'],
  },
  {
    slug: 'prodbx',
    name: 'ProDBX',
    summary: 'Business software built for pool builders: jobs, customers, and quotes, with no design tool.',
    pricing: '$19 to $119 per user per month',
    site: 'https://www.prodbx.com',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'partial', note: 'The business side is in a browser. There is nothing to draw with.' },
      customerOnPhone: { support: 'yes', note: 'Customer portal.' },
      pool3d: { support: 'no' },
      photoreal: { support: 'no' },
      augmentedReality: { support: 'no' },
      priceBook: { support: 'yes', note: 'Distributor-fed catalogues.' },
      priceFromDrawing: { support: 'no', note: 'There is no drawing to price from.' },
      quoteVersioning: UNKNOWN,
      changeApproval: UNKNOWN,
      financing: UNKNOWN,
      customerProposal: { support: 'yes' },
      eSignature: { support: 'yes' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'no' },
      permitDocuments: { support: 'no' },
      scheduling: { support: 'yes' },
      crm: { support: 'yes' },
      serviceRouting: { support: 'partial' },
      teamRoles: { support: 'yes' },
      poolSpecific: { support: 'yes' },
    },
    strengths: ['Built for pool companies, not adapted to them.', 'Runs the business after the sale.', 'Per-user pricing starts low.'],
    gaps: ['No design tool at all, so the drawing happens somewhere else.', 'Nothing connects a shape to a price.'],
  },
  {
    slug: 'poologics',
    name: 'Poologics',
    summary: 'Pool-industry business software with price books and proposals, priced per company.',
    pricing: '$249 to $299 per company per month',
    site: 'https://www.poologics.com',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'partial', note: 'Business side only.' },
      customerOnPhone: { support: 'yes', note: 'Emailed proposal.' },
      pool3d: { support: 'no' },
      photoreal: { support: 'no' },
      augmentedReality: { support: 'no' },
      priceBook: { support: 'yes' },
      priceFromDrawing: { support: 'no' },
      quoteVersioning: UNKNOWN,
      changeApproval: UNKNOWN,
      financing: UNKNOWN,
      customerProposal: { support: 'yes' },
      eSignature: { support: 'yes', note: 'Signing plus comments.' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'no' },
      permitDocuments: { support: 'no' },
      scheduling: { support: 'yes' },
      crm: { support: 'yes' },
      serviceRouting: { support: 'yes' },
      teamRoles: UNKNOWN,
      poolSpecific: { support: 'yes' },
    },
    strengths: ['Whole-company pricing rather than per seat.', 'Proposals with signing and comments.', 'Covers service as well as construction.'],
    gaps: ['No design tool.', 'Price per company is steep for a two-person builder.'],
  },
  {
    slug: 'houzz-pro',
    name: 'Houzz Pro',
    summary: 'The closest thing to the whole vision, built for remodelers rather than pool builders.',
    pricing: '$55 to $399 per month',
    site: 'https://www.houzz.com/pro',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'yes' },
      customerOnPhone: { support: 'yes' },
      pool3d: { support: 'no', note: 'Floor plans, not pools.' },
      photoreal: { support: 'no' },
      augmentedReality: { support: 'no' },
      priceBook: { support: 'yes' },
      priceFromDrawing: { support: 'no' },
      quoteVersioning: UNKNOWN,
      changeApproval: UNKNOWN,
      financing: { support: 'yes' },
      customerProposal: { support: 'yes' },
      eSignature: { support: 'yes', note: 'Signing and payment.' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'no' },
      permitDocuments: { support: 'no' },
      scheduling: { support: 'yes' },
      crm: { support: 'yes' },
      serviceRouting: { support: 'no' },
      teamRoles: { support: 'yes' },
      poolSpecific: { support: 'no', note: 'Nothing in it knows what coping is.' },
    },
    strengths: ['Estimates, proposals, payment and financing in one place.', 'Lead generation built in.'],
    gaps: ['Not a pool tool, so every pool concept has to be typed in by hand.', 'No pool design of any kind.'],
  },
  {
    slug: 'jobber',
    name: 'Jobber',
    summary: 'The generalist field-service platform, strong at running work and indifferent to what the work is.',
    pricing: '$29 to $599 per month',
    site: 'https://getjobber.com',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'yes' },
      customerOnPhone: { support: 'yes', note: 'Client Hub.' },
      pool3d: { support: 'no' },
      photoreal: { support: 'no' },
      augmentedReality: { support: 'no' },
      priceBook: { support: 'yes', note: 'Generic line items.' },
      priceFromDrawing: { support: 'no' },
      quoteVersioning: UNKNOWN,
      changeApproval: UNKNOWN,
      financing: { support: 'yes' },
      customerProposal: { support: 'yes' },
      eSignature: { support: 'yes', note: 'Approve and pay.' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'no' },
      permitDocuments: { support: 'no' },
      scheduling: { support: 'yes' },
      crm: { support: 'yes' },
      serviceRouting: { support: 'yes' },
      teamRoles: { support: 'yes' },
      poolSpecific: { support: 'no' },
    },
    strengths: ['Excellent at scheduling and getting paid.', 'Cheap to start.', 'Enormous install base.'],
    gaps: ['Knows nothing about pools.', 'No design, no takeoff, no geometry.'],
  },
  {
    slug: 'quoteiq',
    name: 'QuoteIQ',
    summary: 'AI estimating from photos for home services, with a price floor that stops underbidding.',
    pricing: '$30 to $699 per month',
    site: 'https://www.myquoteiq.com',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'yes' },
      customerOnPhone: { support: 'yes' },
      pool3d: { support: 'no' },
      photoreal: { support: 'no' },
      augmentedReality: { support: 'no' },
      priceBook: { support: 'yes' },
      priceFromDrawing: { support: 'no', note: 'Estimates from a photo, not from a model you can edit.' },
      quoteVersioning: UNKNOWN,
      changeApproval: UNKNOWN,
      financing: UNKNOWN,
      customerProposal: { support: 'yes' },
      eSignature: { support: 'yes', note: 'Good, better, best, then sign.' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'no' },
      permitDocuments: { support: 'no' },
      scheduling: { support: 'yes' },
      crm: { support: 'yes' },
      serviceRouting: { support: 'yes' },
      teamRoles: UNKNOWN,
      poolSpecific: { support: 'no' },
    },
    strengths: ['Photo to estimate is genuinely fast.', 'Price floors stop a rep bidding below cost.', 'Options presented well.'],
    gaps: ['No pool design.', 'An estimate you cannot adjust by moving the shape.'],
  },
  {
    slug: 'cedreo',
    name: 'Cedreo',
    summary: 'Browser home design with cloud rendering, and the architecture worth studying.',
    pricing: '$129 per month plus render credits',
    site: 'https://cedreo.com',
    verified: '2026-08-19',
    capabilities: {
      browserAuthoring: { support: 'partial', note: 'Desktop browser, and it wants a mouse.' },
      customerOnPhone: { support: 'partial', note: 'Still images.' },
      pool3d: { support: 'partial', note: 'Backyards, not pool construction.' },
      photoreal: { support: 'yes', note: 'Rendered on their farm, not your machine.' },
      augmentedReality: { support: 'no' },
      priceBook: { support: 'no' },
      priceFromDrawing: { support: 'no' },
      quoteVersioning: { support: 'no' },
      changeApproval: { support: 'no' },
      financing: { support: 'no' },
      customerProposal: { support: 'no' },
      eSignature: { support: 'no' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'partial' },
      permitDocuments: { support: 'no' },
      scheduling: { support: 'no' },
      crm: { support: 'no' },
      serviceRouting: { support: 'no' },
      teamRoles: UNKNOWN,
      poolSpecific: { support: 'no' },
    },
    strengths: ['Real rendering without a gaming machine.', 'Fast to a presentable image.'],
    gaps: ['No estimating at all.', 'Not built for pools.'],
  },
]

export const ALL_PRODUCTS: readonly Product[] = [POOL_FORGE, ...COMPETITORS]

export function productBySlug(slug: string): Product | undefined {
  return ALL_PRODUCTS.find((product) => product.slug === slug)
}

/**
 * What a product does for one feature, never inventing an answer.
 *
 * A key nobody recorded comes back `unknown`, which is the only safe default
 * when the output is a public statement about somebody else's software.
 */
export function capabilityOf(product: Product, key: FeatureKey): Capability {
  return product.capabilities[key] ?? UNKNOWN
}

/** Features where Pool Forge does something no listed competitor does. */
export function uncontestedFeatures(): Feature[] {
  return FEATURES.filter((feature) => {
    const ours = capabilityOf(POOL_FORGE, feature.key).support
    if (ours !== 'yes') return false
    return COMPETITORS.every((rival) => capabilityOf(rival, feature.key).support !== 'yes')
  })
}
