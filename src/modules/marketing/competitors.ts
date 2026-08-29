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
  // Drawing and visualising
  | 'browserAuthoring' | 'mobileAuthoring' | 'customerOnPhone' | 'planView' | 'pool3d'
  | 'photoreal' | 'flythroughVideo' | 'panorama360' | 'virtualReality' | 'augmentedReality'
  | 'sunStudy' | 'terrainGrading' | 'existingStructures' | 'propertyLines' | 'freeformShapes'
  | 'materialLibrary' | 'plantLibrary' | 'sceneTemplates'
  // Measuring
  | 'autoMeasurements' | 'takeoffQuantities' | 'earthworkVolumes' | 'photoToDesign' | 'siteCapture'
  // Money
  | 'priceBook' | 'costAndRetail' | 'margin' | 'formulas' | 'assemblies'
  | 'priceFromDrawing' | 'optionsAlternates' | 'salesTax' | 'laborRates' | 'changeOrders'
  | 'quoteVersioning' | 'changeApproval' | 'priceBookImport' | 'supplierCatalog' | 'financing'
  // Paperwork
  | 'customerProposal' | 'eSignature' | 'onlinePayment' | 'storedSentCopy' | 'branding'
  | 'constructionDrawings' | 'permitDocuments' | 'sectionsElevations' | 'materialSchedule' | 'vendorRfq'
  // Running the business
  | 'leadsCrm' | 'salesPipeline' | 'scheduling' | 'jobCosting' | 'purchaseOrders'
  | 'timeTracking' | 'crewMobile' | 'dailyLogs' | 'invoicing' | 'accountingSync'
  | 'reporting' | 'teamRoles' | 'multiLocation' | 'customerPortal' | 'openApi'
  | 'serviceRouting' | 'poolSpecific' | 'aiAssist'

export interface Feature {
  key: FeatureKey
  label: string
  /** Why a pool builder would care. Written for them, not for us. */
  matters: string
  group: 'Drawing' | 'Measuring' | 'Money' | 'Paperwork' | 'Business'
}

/**
 * Every distinct thing any product in this market does.
 *
 * Wide on purpose. A short list flatters whoever wrote it, and the question
 * being asked here is what the competition actually does, which only a long
 * list can answer honestly.
 */
export const FEATURES: readonly Feature[] = [

  { key: 'browserAuthoring', group: 'Drawing', label: 'Designs in a browser',
    matters: 'No Windows box with a gaming card, and nothing to install on the laptop you carry to a kitchen table.' },
  { key: 'mobileAuthoring', group: 'Drawing', label: 'Design on a tablet or phone',
    matters: "Sketching in the customer's back garden instead of back at the office." },
  { key: 'customerOnPhone', group: 'Drawing', label: 'Customer views on their phone',
    matters: 'The person paying looks at it on the sofa that evening, not over your shoulder in the driveway.' },
  { key: 'planView', group: 'Drawing', label: '2D plan view',
    matters: 'What a permit office and a crew both read.' },
  { key: 'pool3d', group: 'Drawing', label: '3D pool model',
    matters: 'A shape a homeowner can turn around beats a plan they have to interpret.' },
  { key: 'photoreal', group: 'Drawing', label: 'Photorealistic rendering',
    matters: 'What sells a ninety thousand dollar job to somebody who has never bought one.' },
  { key: 'flythroughVideo', group: 'Drawing', label: 'Flythrough video',
    matters: 'Something to leave behind that they show their partner.' },
  { key: 'panorama360', group: 'Drawing', label: '360 panorama',
    matters: 'Look around from inside the design with no app to install.' },
  { key: 'virtualReality', group: 'Drawing', label: 'Virtual reality',
    matters: 'Headset walkthrough. Impressive, rarely decisive.' },
  { key: 'augmentedReality', group: 'Drawing', label: 'Augmented reality on site',
    matters: 'Standing in the actual yard and seeing the actual pool.' },
  { key: 'sunStudy', group: 'Drawing', label: 'Sun and shade study',
    matters: 'Where the shade falls at four in the afternoon, which is when people sit outside.' },
  { key: 'terrainGrading', group: 'Drawing', label: 'Ground levels and grading',
    matters: 'A sloped lot is most lots, and it decides the earthwork.' },
  { key: 'existingStructures', group: 'Drawing', label: 'The house and what is already there',
    matters: 'Setbacks are measured from something real or they are guesses.' },
  { key: 'propertyLines', group: 'Drawing', label: 'Property lines and setbacks',
    matters: 'A permit set without them comes back.' },
  { key: 'freeformShapes', group: 'Drawing', label: 'Freeform pool shapes',
    matters: 'Not every pool is a rectangle from a catalogue.' },
  { key: 'materialLibrary', group: 'Drawing', label: 'Finishes and materials',
    matters: 'Plaster, pebble, tile, coping, decking. What the customer actually chooses between.' },
  { key: 'plantLibrary', group: 'Drawing', label: 'Planting and landscape',
    matters: 'The rest of the backyard, which is often the rest of the sale.' },
  { key: 'sceneTemplates', group: 'Drawing', label: 'Saved scenes and templates',
    matters: 'Your three best sellers, ready to drop in.' },

  { key: 'autoMeasurements', group: 'Measuring', label: 'Measurements from the drawing',
    matters: 'Area, perimeter, volume, without a tape or a calculator.' },
  { key: 'takeoffQuantities', group: 'Measuring', label: 'Takeoff quantities',
    matters: 'How much concrete, how much coping, how many lights.' },
  { key: 'earthworkVolumes', group: 'Measuring', label: 'Cut and fill volumes',
    matters: 'Dirt is money, and it is the number most often guessed.' },
  { key: 'photoToDesign', group: 'Measuring', label: 'Photo to design',
    matters: 'Point a camera at a yard and get something to work from.' },
  { key: 'siteCapture', group: 'Measuring', label: 'Measured site capture',
    matters: 'A survey of the actual yard rather than an estimate of it.' },

  { key: 'priceBook', group: 'Money', label: 'Your own price book',
    matters: 'Your costs and your margins, not a vendor catalogue.' },
  { key: 'costAndRetail', group: 'Money', label: 'Cost and retail separately',
    matters: 'What you pay and what you charge are different numbers.' },
  { key: 'margin', group: 'Money', label: 'Margin and markup',
    matters: 'The number the business actually runs on.' },
  { key: 'formulas', group: 'Money', label: 'Formula driven pricing',
    matters: 'Concrete per cubic yard with a waste factor, not a flat guess.' },
  { key: 'assemblies', group: 'Money', label: 'Assemblies and kits',
    matters: 'A pool is thirty line items. Sell it as one.' },
  { key: 'priceFromDrawing', group: 'Money', label: 'Priced from the drawing',
    matters: 'Widen the pool and the number moves. No second pass in a spreadsheet, and no chance the two disagree.' },
  { key: 'optionsAlternates', group: 'Money', label: 'Options and alternates',
    matters: 'Good, better, best is how a bigger job gets sold.' },
  { key: 'salesTax', group: 'Money', label: 'Sales tax',
    matters: 'Different in the next county, and wrong is a real cost.' },
  { key: 'laborRates', group: 'Money', label: 'Labour rates',
    matters: 'Crew time is most of the job and the easiest thing to underbid.' },
  { key: 'changeOrders', group: 'Money', label: 'Change orders',
    matters: 'The scope moves after signing. It always moves.' },
  { key: 'quoteVersioning', group: 'Money', label: 'Versioned prices',
    matters: 'A price rise cannot silently rewrite a quote somebody already signed.' },
  { key: 'changeApproval', group: 'Money', label: 'Reviewed price changes',
    matters: 'One person keeps the price book and everybody else asks. That is how it already works, in text messages.' },
  { key: 'priceBookImport', group: 'Money', label: 'Import your spreadsheet',
    matters: 'The price book already exists. It is in Excel.' },
  { key: 'supplierCatalog', group: 'Money', label: 'Supplier catalogues',
    matters: 'Distributor pricing that updates without retyping.' },
  { key: 'financing', group: 'Money', label: 'Customer financing',
    matters: 'A monthly payment turns a flinch into a signature.' },

  { key: 'customerProposal', group: 'Paperwork', label: 'Customer proposal',
    matters: 'The document that gets signed.' },
  { key: 'eSignature', group: 'Paperwork', label: 'Signed online',
    matters: 'They accept from the sofa instead of you driving back out.' },
  { key: 'onlinePayment', group: 'Paperwork', label: 'Takes the deposit',
    matters: 'Signed and paid in the same sitting.' },
  { key: 'storedSentCopy', group: 'Paperwork', label: 'Keeps what was sent',
    matters: 'What did we send them in March, exactly. A re-render of today is not an answer.' },
  { key: 'branding', group: 'Paperwork', label: 'Your branding on it',
    matters: "It is your company's document, not the software's." },
  { key: 'constructionDrawings', group: 'Paperwork', label: 'Construction drawings',
    matters: 'What the crew builds from.' },
  { key: 'permitDocuments', group: 'Paperwork', label: 'Permit documents',
    matters: 'A rejected packet costs weeks of schedule.' },
  { key: 'sectionsElevations', group: 'Paperwork', label: 'Sections and elevations',
    matters: 'Depths, benches and steps, drawn the way a builder reads them.' },
  { key: 'materialSchedule', group: 'Paperwork', label: 'Material schedule',
    matters: 'What to order, in one list.' },
  { key: 'vendorRfq', group: 'Paperwork', label: 'Vendor requests for quote',
    matters: 'Screen cages and equipment get bid out. Give the vendor something to price.' },

  { key: 'leadsCrm', group: 'Business', label: 'Leads and customers',
    matters: 'Who asked, when, and what you quoted them.' },
  { key: 'salesPipeline', group: 'Business', label: 'Sales pipeline',
    matters: 'Which jobs are actually going to close this month.' },
  { key: 'scheduling', group: 'Business', label: 'Scheduling and jobs',
    matters: 'Running the build after it is sold.' },
  { key: 'jobCosting', group: 'Business', label: 'Job costing',
    matters: 'Whether you made money on it, known before the next one is bid.' },
  { key: 'purchaseOrders', group: 'Business', label: 'Purchase orders',
    matters: 'What was ordered, from whom, at what price.' },
  { key: 'timeTracking', group: 'Business', label: 'Time tracking',
    matters: 'Hours against the job, not against the week.' },
  { key: 'crewMobile', group: 'Business', label: 'Crew app in the field',
    matters: 'The people digging are not at a desk.' },
  { key: 'dailyLogs', group: 'Business', label: 'Photos and daily logs',
    matters: 'Proof of what happened, when the customer asks.' },
  { key: 'invoicing', group: 'Business', label: 'Invoicing',
    matters: 'Getting paid, in stages, on a build that takes months.' },
  { key: 'accountingSync', group: 'Business', label: 'Accounting sync',
    matters: 'Nobody wants to type it twice.' },
  { key: 'reporting', group: 'Business', label: 'Reporting',
    matters: 'Which of the six salespeople is actually selling.' },
  { key: 'teamRoles', group: 'Business', label: 'Team and permissions',
    matters: 'Six salespeople quoting from one price list, with one person allowed to change it.' },
  { key: 'multiLocation', group: 'Business', label: 'Multiple locations',
    matters: 'Tampa and Orlando have different tax, different labour and different licences.' },
  { key: 'customerPortal', group: 'Business', label: 'Customer portal',
    matters: 'One link for everything, instead of nine emails.' },
  { key: 'openApi', group: 'Business', label: 'Open API',
    matters: 'Whether it can be joined to what you already run.' },
  { key: 'serviceRouting', group: 'Business', label: 'Service and routes',
    matters: 'Recurring maintenance, which is a different business from building.' },
  { key: 'poolSpecific', group: 'Business', label: 'Built for pools',
    matters: 'A generic construction tool does not know what coping is, so somebody teaches it every time.' },
  { key: 'aiAssist', group: 'Business', label: 'AI that does real work',
    matters: 'Not a chat box. Something that removes a step.' },
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
    leadsCrm: { support: 'partial', note: 'Customer records against jobs. Not a sales pipeline.' },
    serviceRouting: { support: 'no' },
    teamRoles: { support: 'partial', note: 'Roles decide who may change the price book. Invites are in progress.' },
    planView: { support: 'yes' },
    flythroughVideo: { support: 'no' },
    panorama360: { support: 'no' },
    virtualReality: { support: 'no' },
    mobileAuthoring: { support: 'no', note: 'The editor wants a real screen. The customer\'s view does not.' },
    sunStudy: { support: 'yes', note: 'Sunrise to sunset on a slider.' },
    terrainGrading: { support: 'yes', note: 'Existing and finished ground, with cut and fill reported apart.' },
    existingStructures: { support: 'yes', note: 'Place the house, and setbacks are measured from it rather than assumed.' },
    propertyLines: { support: 'yes' },
    freeformShapes: { support: 'partial', note: 'Seventeen pool shapes, plus polygon footprints from import.' },
    materialLibrary: { support: 'yes', note: 'Finishes priced from your book, in the unit they are sold in.' },
    plantLibrary: { support: 'no' },
    sceneTemplates: { support: 'yes' },
    autoMeasurements: { support: 'yes', note: 'Area, perimeter, volume and wetted area, live.' },
    takeoffQuantities: { support: 'yes' },
    earthworkVolumes: { support: 'yes', note: 'Cut and fill reported separately, never netted.' },
    photoToDesign: { support: 'partial', note: 'Import from an image runs, and a scale reference is still needed.' },
    siteCapture: { support: 'no', note: 'The server half is built and there is no phone app yet.' },
    costAndRetail: { support: 'yes' },
    margin: { support: 'no' },
    formulas: { support: 'no', note: 'Flat unit prices only.' },
    assemblies: { support: 'no' },
    optionsAlternates: { support: 'no' },
    salesTax: { support: 'yes' },
    laborRates: { support: 'partial', note: 'As line items, not as crew hours.' },
    changeOrders: { support: 'no' },
    priceBookImport: { support: 'yes', note: 'From the spreadsheet you already keep, mapped for you.' },
    supplierCatalog: { support: 'no' },
    onlinePayment: { support: 'no' },
    branding: { support: 'yes', note: 'Your logo, colour, licence and terms.' },
    sectionsElevations: { support: 'partial' },
    materialSchedule: { support: 'partial' },
    vendorRfq: { support: 'yes', note: 'Screen enclosure request for quote.' },
    salesPipeline: { support: 'no' },
    jobCosting: { support: 'no' },
    purchaseOrders: { support: 'no' },
    timeTracking: { support: 'no' },
    crewMobile: { support: 'no' },
    dailyLogs: { support: 'no' },
    invoicing: { support: 'no' },
    accountingSync: { support: 'no' },
    reporting: { support: 'no' },
    multiLocation: { support: 'no', note: 'One set of company details today.' },
    customerPortal: { support: 'partial', note: 'A share link per proposal, not an account.' },
    openApi: { support: 'no' },
    aiAssist: { support: 'partial', note: 'Reads a price list and an uploaded sketch. Not a chat box.' },
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
      priceFromDrawing: { support: 'no', note: 'Quantities come out, money does not, and their own FAQ says that is by design.' },
      quoteVersioning: UNKNOWN,
      changeApproval: { support: 'no' },
      financing: { support: 'no' },
      customerProposal: { support: 'partial' },
      eSignature: { support: 'no' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'yes' },
      permitDocuments: { support: 'partial' },
      scheduling: { support: 'no' },
      leadsCrm: { support: 'no' },
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
      leadsCrm: { support: 'no' },
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
    // The old figure here was a promotional column lifted from a listing site.
    // List pricing with the seat minimum applied turns a $99 headline into
    // roughly $495 a month for a five person shop, which is a different product
    // decision for a builder than the number they first see.
    pricing: '$19 to $139 per user per month, with a five to ten seat minimum',
    site: 'https://www.prodbx.com',
    verified: '2026-08-28',
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
      leadsCrm: { support: 'yes' },
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
    pricing: '$279 per company per month annual, $329 monthly, capped at 20 users',
    site: 'https://www.poologics.com',
    verified: '2026-08-28',
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
      leadsCrm: { support: 'yes' },
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
      leadsCrm: { support: 'yes' },
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
      leadsCrm: { support: 'yes' },
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
      leadsCrm: { support: 'yes' },
      serviceRouting: { support: 'yes' },
      teamRoles: UNKNOWN,
      poolSpecific: { support: 'no' },
    },
    strengths: ['Photo to estimate is genuinely fast.', 'Price floors stop a rep bidding below cost.', 'Options presented well.'],
    gaps: ['No pool design.', 'An estimate you cannot adjust by moving the shape.'],
  },
  {
    slug: 'jobtread',
    name: 'JobTread',
    summary: 'Construction management for the whole build, with a partner marketplace rather than a design tool of its own.',
    pricing: 'Published per company, tiered by users',
    site: 'https://www.jobtread.com',
    verified: '2026-08-28',
    capabilities: {
      browserAuthoring: { support: 'yes', note: 'The business runs in a browser. There is nothing to draw a pool with.' },
      customerOnPhone: { support: 'yes' },
      pool3d: { support: 'no' },
      photoreal: { support: 'no' },
      augmentedReality: { support: 'no' },
      priceBook: { support: 'yes' },
      priceFromDrawing: { support: 'partial', note: 'Through a scanning partner, which populates an estimate from captured measurements. Not from a pool you design.' },
      quoteVersioning: UNKNOWN,
      changeApproval: UNKNOWN,
      financing: UNKNOWN,
      customerProposal: { support: 'yes' },
      eSignature: { support: 'yes' },
      storedSentCopy: UNKNOWN,
      constructionDrawings: { support: 'no' },
      permitDocuments: { support: 'no' },
      scheduling: { support: 'yes' },
      leadsCrm: { support: 'yes' },
      serviceRouting: { support: 'partial' },
      teamRoles: { support: 'yes' },
      poolSpecific: { support: 'no' },
    },
    strengths: [
      'Runs a construction business properly, end to end.',
      'An open API and a real partner programme, so it integrates rather than blocks.',
      'Large and established across the trades.',
    ],
    gaps: [
      'No pool design, and nothing in it knows what a pool is.',
      'The measurement to estimate loop exists only through a partner built for interiors.',
    ],
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
      leadsCrm: { support: 'no' },
      serviceRouting: { support: 'no' },
      teamRoles: UNKNOWN,
      poolSpecific: { support: 'no' },
    },
    strengths: ['Real rendering without a gaming machine.', 'Fast to a presentable image.'],
    gaps: ['No estimating at all.', 'Not built for pools.'],
  },
]


/**
 * Products a pool builder may already run that this does not compete with.
 *
 * Pool Brain is service and route management: recurring maintenance, technicians
 * and trucks. Their own feature matrix has no row for design, rendering,
 * takeoffs, signatures or financing anywhere in a hundred and fifty of them.
 * Their customer has routes, ours has permits and excavators.
 *
 * Kept out of `COMPETITORS` on purpose. A comparison page implying a contest
 * would be a claim nobody in the trade would recognise, and being caught
 * inventing a rivalry costs more than the page could ever earn.
 */
export const ADJACENT: readonly Product[] = [
  {
    slug: 'pool-brain',
    name: 'Pool Brain',
    summary: 'Service and route management for pool maintenance companies, which is a different business from building them.',
    pricing: '$50 per month plus $65 per active technician',
    site: 'https://poolbrain.com',
    verified: '2026-08-28',
    capabilities: {
      browserAuthoring: { support: 'yes' },
      customerOnPhone: { support: 'yes' },
      pool3d: { support: 'no' },
      photoreal: { support: 'no' },
      priceBook: { support: 'partial', note: 'A service catalogue, for repairs and upsells.' },
      priceFromDrawing: { support: 'no' },
      customerProposal: { support: 'partial', note: 'Repair quotes, not construction proposals.' },
      scheduling: { support: 'yes' },
      leadsCrm: { support: 'yes' },
      serviceRouting: { support: 'yes', note: 'The thing it is actually for.' },
      teamRoles: { support: 'yes' },
      poolSpecific: { support: 'yes' },
    },
    strengths: [
      'Genuinely good at routes, technicians and recurring work.',
      'Prices honestly per technician rather than per company.',
    ],
    gaps: [
      'Not a construction tool, and does not claim to be.',
    ],
  },
]

export const ALL_PRODUCTS: readonly Product[] = [POOL_FORGE, ...COMPETITORS]

export function productBySlug(slug: string): Product | undefined {
  return [...ALL_PRODUCTS, ...ADJACENT].find((product) => product.slug === slug)
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
