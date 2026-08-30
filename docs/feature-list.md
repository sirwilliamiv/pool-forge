# Feature list

What Pool Forge does today, and what it does not do yet. This is the honesty
that used to live in the "Not yet" blocks at the foot of the three product
pages and on the request-access page; those sections came off the marketing
site on 30 Aug 2026 and this document is where the record moved. The rule it
serves is unchanged: **every claim on a marketing page is something the app
does today**, and a list of the gaps is what makes that rule checkable.

`docs/feature-matrix.md` is the competitor-facing view of the same facts,
generated from `src/modules/marketing/competitors.ts`. When a gap below is
closed, update the competitors module (which fixes the matrix and the public
comparison pages) and move the line here from "not yet" to "does".

## The editor

Does today:

- 2D plan drawing on a snapping grid, starting from a line rather than a template
- One scene viewed three ways: plan, 3D, and section with cut and fill
- Measurements derived from the drawing (surface area, perimeter, volume, wetted area), nobody measures by hand
- Live quote recomputed from the drawing as it changes
- Multiple design options per project ("draw three, sell one")
- Sun study with a time-of-day slider
- Scene templates, stencils, layers and sheets
- Versions: a quote stores the measurements, selections and price book version it was built from
- A voice agent (Marco): navigation, pointing at controls, reading and filling the screen, executing commands through the same registry as every button

Not yet:

- Photoreal rendering (the render is clear, not photographic)
- Flythrough video
- 360 panoramas
- VR and AR
- Drawing on a phone (the proposal reads fine on one; drawing wants a laptop)
- A plant library
- On-canvas resize handles

## Quoting and money

Does today:

- Your own price book: your costs and margins, not a vendor catalogue
- Cost and retail as separate numbers, sales tax, versioned prices
- One keeper of the book; everybody else asks (reviewed price changes)
- Validation rules between a draft and a send
- Four documents from one drawing
- A sent proposal keeps the prices it was sent with
- Spreadsheet import
- Acceptance by typed name on the shared proposal, with the accepted copy kept as sent

Not yet:

- Formulas and assemblies (`PriceBookItem.formula` is a dead column; prices are flat per unit)
- Margin targets
- Options and alternates
- Change orders
- Online payment
- Financing
- Supplier catalogues
- A server-rendered PDF (documents print from the browser)
- A third-party e-signature service (acceptance is a typed name, not DocuSign)
- Job costing against actuals
- Invoicing
- Accounting sync

## The business

Does today:

- Everything hangs off the job: customers kept against jobs with a record of what happened
- Site data arrives before you do (parcel and site context)
- From a photograph to a measured project (customer uploads and import)
- Roles that protect the price book
- A per-person audit trail ("what did this person actually do")

Not yet:

- Scheduling
- Service routing
- Purchase orders
- Time tracking
- A crew mobile app
- Daily logs
- Reporting dashboards
- A sales pipeline / CRM
- Multiple locations
- A customer account portal
- A public API
- Invite emails that send themselves (no mail provider; an operator mints the link, see `docs/beta-operations.md`)
- LiDAR capture

## Housekeeping

- The product-page header comments still name what each page must not claim;
  they point here now instead of at an on-page block.
- `src/test/e2e/waitlist.spec.ts` asserts the request-access page no longer
  carries a "What it does not do yet" section.
