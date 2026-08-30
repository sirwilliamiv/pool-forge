import type { Metadata } from 'next'

import {
  FeatureGrid,
  Hero,
  PointList,
  ReadNext,
  SectionHead,
  Split,
} from '@/components/marketing/blocks'
import {
  ChecklistPlate,
  DocumentsPlate,
  ImportPlate,
  Pip,
  QuotePlate,
  SentPanel,
} from '@/components/marketing/plates'

// EVERY CLAIM ON THIS PAGE IS SOMETHING THE APP DOES TODAY.
//
// Money claims are the ones a builder will hold you to, so they get the
// strictest reading of that rule. Specifically not claimed here, because they
// are not built: formulas and assemblies (`PriceBookItem.formula` is a dead
// column and prices are flat per unit), margin targets, options and
// alternates, change orders, online payment, financing, supplier catalogues,
// a server-rendered PDF, and a third-party e-signature service. All of them
// are recorded in `docs/feature-list.md`.
//
// `src/modules/marketing/competitors.ts` is the canonical record. Check a claim
// against it and against the running app before changing a word.

export const metadata: Metadata = {
  title: 'Quoting and paperwork · Pool Forge',
  description:
    'Import the price book you already keep in a spreadsheet, price the drawing from it line by line, and print the proposal, the construction set and the site plan from the same geometry.',
}

const HREF = '/product/quoting'

export default function QuotingPage() {
  return (
    <div className="mk" data-accent="sandbar">
      <Hero
        eyebrow="Quoting and paperwork"
        headline={<>Your prices, attached to the&nbsp;shape.</>}
        lead="Import the price book you already keep in a spreadsheet. Widen the pool by a foot and the quote moves in the same breath, then prints as the proposal the customer signs and the set the crew builds from."
        shapes={<QuotingShapes />}
        plate={<Pip base={<QuotePlate />} inset={<SentPanel />} />}
      />

      {/* -------------------------------------------------- the price book */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="The price book"
            title="It is your list, not ours"
            lead="Nobody is going to retype four hundred lines to try a piece of software. Upload the spreadsheet you already price from and it comes across as it is."
          />
          <Split>
            <div>
              <PointList
                points={[
                  {
                    lead: 'Upload the workbook.',
                    rest: 'Columns are matched for you and you correct what it got wrong. A preview shows exactly what will be saved before anything is.',
                  },
                  {
                    lead: 'Every number is checked against the file.',
                    rest: 'A cell that does not look like a price is refused and named, rather than quietly rounded into your quote.',
                  },
                  {
                    lead: 'Versioned, and additive by default.',
                    rest: 'A new version starts from the one before it rather than empty, and a second import replaces what it matches instead of stacking a duplicate on top.',
                  },
                  {
                    lead: 'Cost and retail, side by side.',
                    rest: 'Sixteen categories from earthwork to lanai, and six units, including cubic yards, because that is how an excavator bills.',
                  },
                ]}
              />
            </div>
            <div className="mk-tintfield">
              <ImportPlate />
            </div>
          </Split>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* ------------------------------------------------ who moves a price */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Keeping the list"
            title="One person keeps the book. Everybody else asks."
            lead="The workflow this replaces was described to us exactly: one person owns the list, six salespeople quote from copies of it, and a price change lives in a text message that nobody can find later."
          />
          <FeatureGrid
            columns={4}
            cells={[
              {
                title: 'A request, not a text message',
                body: 'Propose the line you need changed, with the reason attached. It waits for the person who keeps the book instead of getting lost in a thread.',
              },
              {
                title: 'Written against a version',
                body: 'If the book moves while a request is waiting, applying it blindly would undo whatever the keeper did in between. So it says so instead of pretending.',
              },
              {
                title: 'Roles decide who may',
                body: 'Owners and admins keep the book. Everybody else quotes from it. The refusal names the job rather than showing an internal id.',
              },
              {
                title: 'Tax at your rate',
                body: 'Sales tax is a setting on the organisation and lands on the quote as its own line, where a customer can see what it is.',
              },
            ]}
          />
        </div>
      </section>

      <hr className="mk-rule" />

      {/* --------------------------------------------------- the checklist */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Before it goes out"
            title="Seventeen rules stand between a draft and a send"
            lead="Not a linter for its own sake. Every one of these is something that has gone out wrong on somebody's proposal before."
          />
          <Split flip>
            <div>
              <PointList
                points={[
                  {
                    lead: 'Pass, warn, or stop.',
                    rest: 'A warning lets you send with your eyes open. A blocking error does not, because a heater with no fuel type is not a decision anybody made.',
                  },
                  {
                    lead: 'Click it and it takes you there.',
                    rest: 'Each result carries the thing at fault, so the fix is one click rather than a hunt through the drawing.',
                  },
                  {
                    lead: 'It reads the drawing, not a form.',
                    rest: 'Depth ordered shallow to deep, a buildable footprint, an interior finish chosen, a deck material, walkable slope, fill that is not under the pool, a total that is not zero.',
                  },
                ]}
              />
            </div>
            <div className="mk-tintfield">
              <ChecklistPlate />
            </div>
          </Split>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* ---------------------------------------------------- the documents */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Documents"
            title="Four documents, one drawing"
            lead="The customer's proposal, the crew's set, the plan the county wants and the request you send a vendor all come off the same geometry, so they cannot disagree with each other."
          />
          <Split>
            <div>
              <PointList
                points={[
                  {
                    lead: 'The proposal.',
                    rest: 'Your logo, your colour, your licence number and your terms. Line items grouped the way your book is grouped, and the paths you sketched drawn on the plan.',
                  },
                  {
                    lead: 'The construction packet.',
                    rest: 'Eleven by seventeen, dense with measurements, with Letter as an opt-in for the office printer that will not take the big sheet.',
                  },
                  {
                    lead: 'The site plan.',
                    rest: 'Lot line, house, setbacks measured from the wall rather than assumed. It stops short of calling itself permit-submittable until it is.',
                  },
                  {
                    lead: 'The screen enclosure request.',
                    rest: 'Specs and quantities in the form the vendor wants, so the quote comes back the same week.',
                  },
                ]}
              />
            </div>
            <div className="mk-tintfield">
              <DocumentsPlate />
            </div>
          </Split>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* --------------------------------------------------------- the send */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Sent"
            title="A sent proposal keeps the prices it was sent with"
            lead="Editing the book on Tuesday must not change what a customer agreed to on Monday. This is the part most spreadsheets get wrong, and it is the part that ends up in front of a lawyer."
          />
          <FeatureGrid
            columns={4}
            cells={[
              {
                title: 'Filed as sent',
                body: 'The document is stored as the file that went out, not re-rendered on demand from whatever the price book says today.',
              },
              {
                title: 'Replayable',
                body: 'Every quote keeps its full input set: the measurements, the selections and the price book version. Months later it can be rebuilt line for line.',
                meta: 'Snapshot',
              },
              {
                title: 'They open it on their phone',
                body: 'A share link, no account, no app. The document reads the same on the phone in their kitchen as on the sheet you handed them.',
              },
              {
                title: 'Accepted, and recorded',
                body: 'The customer accepts from that same link, and the acceptance is written against the job with the time it happened.',
              },
            ]}
          />
        </div>
      </section>

      <ReadNext currentHref={HREF} />
    </div>
  )
}

function QuotingShapes() {
  return (
    <>
      <span
        className="mk-shape mk-shape--petal mk-anim-shape"
        style={{
          background: '#FF7237',
          width: '19rem',
          height: '19rem',
          right: '-6rem',
          top: '-6rem',
          ['--fly-x' as string]: '9rem',
          ['--fly-y' as string]: '-6rem',
        }}
      />
      <span
        className="mk-shape mk-shape--bite mk-anim-shape"
        style={{
          background: '#00B6FF',
          width: '14rem',
          height: '14rem',
          left: '-4rem',
          bottom: '-4rem',
          animationDelay: '0.08s',
          ['--fly-x' as string]: '-8rem',
        }}
      />
      <span
        className="mk-shape mk-shape--check mk-anim-shape"
        style={{
          ['--shape-color' as string]: '#C7F8FB',
          width: '17rem',
          height: '11rem',
          right: '-4rem',
          bottom: '-3rem',
          animationDelay: '0.16s',
          ['--fly-y' as string]: '7rem',
        }}
      />
    </>
  )
}
