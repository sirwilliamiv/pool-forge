import type { Metadata } from 'next'

import {
  FeatureGrid,
  Gaps,
  Hero,
  PointList,
  ReadNext,
  SectionHead,
  Split,
} from '@/components/marketing/blocks'
import {
  AuditPanel,
  Card,
  IntakePlate,
  JobsPlate,
  Pip,
  TeamPanel,
} from '@/components/marketing/plates'

// EVERY CLAIM ON THIS PAGE IS SOMETHING THE APP DOES TODAY.
//
// This is the page where it is easiest to slip, because "runs the business"
// invites claims about scheduling, job costing and invoicing that Pool Forge
// does not make. It keeps customers against jobs and a record of what happened
// to them. It is not a field service platform and it is not an ERP, and the
// "Not yet" block says so in more words than the rest of the page.
//
// Two specifics worth restating: there is no sales pipeline, and invite emails
// do not send themselves yet — there is no mail provider configured, so an
// operator mints the link and passes it on. Both are named below.
//
// `src/modules/marketing/competitors.ts` is the canonical record.

export const metadata: Metadata = {
  title: 'Jobs and the record · Pool Forge',
  description:
    'Customers against jobs, an intake link the customer fills from their phone, roles that decide who may move a price, and an audit log of every change anybody made.',
}

const HREF = '/product/business'

export default function BusinessPage() {
  return (
    <div className="mk" data-accent="dusk">
      <Hero
        eyebrow="Jobs and the record"
        headline={<>A job, and everything that happened to&nbsp;it.</>}
        lead="Customers, the photos they send before you drive out, who on your team may move a price, and a written record of every change anybody made to any of it."
        shapes={<BusinessShapes />}
        plate={<Pip base={<JobsPlate />} inset={<AuditPanel />} />}
      />

      {/* ---------------------------------------------------- jobs */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Jobs"
            title="Everything hangs off the job"
            lead="A customer, their address, and the work you are quoting them. Every design, every quote, every document and every comment lives on that one record rather than in four places that have to be kept in step."
          />
          <FeatureGrid
            columns={3}
            cells={[
              {
                title: 'Six states, in order',
                body: 'Draft, ready for review, proposal sent, approved, construction ready, archived. The status is what it is because of what happened, not because somebody remembered to update it.',
                meta: 'Draft → archived',
              },
              {
                title: 'Customers, not leads',
                body: 'A person, a phone number and the address the pool is going in. Enough to write the proposal and enough to find the job again.',
              },
              {
                title: 'Every design on the rack',
                body: 'Up to forty alternatives against one job, each with its own drawing and its own total. One is active, and the active one is what the quote and the documents read.',
                meta: '40 max',
              },
              {
                title: 'Your company, set once',
                body: 'Logo, colour, licence number, terms and tax rate. Every document you send carries them without you doing anything.',
              },
              {
                title: 'Quoting on day one',
                body: 'A new company starts with a working price book rather than an empty table, so the first job can be quoted the afternoon the account opens.',
              },
              {
                title: 'Nothing crosses companies',
                body: 'Every query is scoped to your organisation. There is no global view, and no screen that could accidentally show you somebody else’s job.',
              },
            ]}
          />
        </div>
      </section>

      <hr className="mk-rule" />

      {/* -------------------------------------------------------- intake */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Intake"
            title="The site arrives before you do"
            lead="The hour you spend driving out to photograph a back yard is an hour you are not selling. Send a link instead and let the customer do it from the phone that is already in their hand."
          />
          <Split>
            <div>
              <PointList
                points={[
                  {
                    lead: 'No account, no app.',
                    rest: 'A link they open, a few photos, done. It works on the phone that took the pictures, including the HEIC files an iPhone actually produces.',
                  },
                  {
                    lead: 'Photos, sketches, the survey.',
                    rest: 'A picture of the yard, a sketch on graph paper with the dimensions written on it, or the PDF survey from closing. All of it lands on the job.',
                  },
                  {
                    lead: 'The link is public, and treated that way.',
                    rest: 'Uploads are size-capped before a byte of the body is read and rate-limited per address, because a public endpoint is one a stranger can find.',
                  },
                  {
                    lead: 'It becomes something you can trace.',
                    rest: 'The images sit on the job as source material for the import, rather than in an email you have to go and find.',
                  },
                ]}
              />
            </div>
            <div className="mk-tintfield">
              <IntakePlate />
            </div>
          </Split>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* -------------------------------------------------------- import */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Import"
            title="From a photograph to a measured project"
            lead="Reading a picture is the part every competitor leaves alone. It runs here, and it is honest about what it still needs from you."
          />
          <FeatureGrid
            columns={4}
            cells={[
              {
                title: 'It works out what it is looking at',
                body: 'A yard photograph, a hand sketch and a surveyor’s drawing are three different problems, and the first step is deciding which one arrived.',
              },
              {
                title: 'It reads the numbers you wrote',
                body: 'Dimensions written on a graph-paper sketch come off the image as dimensions, not as a note somebody has to retype.',
              },
              {
                title: 'Then it gets precise',
                body: 'A second pass finds the grid, separates the ink from the paper and simplifies the traced outline into the corners you meant.',
              },
              {
                title: 'You approve it before it lands',
                body: 'Nothing is committed to the job until you have seen what it read and corrected it. Extraction proposes; you decide.',
                meta: 'Needs a scale reference',
              },
            ]}
          />
          <p className="mk-caption" style={{ marginTop: '1.5rem', maxWidth: '44rem' }}>
            It still needs something of known size in the frame to set the scale. Without
            one, it will give you the shape and ask you for the dimension.
          </p>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* ---------------------------------------------------------- team */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Team"
            title="Roles exist to protect one thing"
            lead="Access control on a drawing tool is usually theatre. Here it guards the price book, which is the one object in the product where a wrong edit costs money on every quote that follows."
          />
          <Split flip>
            <div>
              <PointList
                points={[
                  {
                    lead: 'Owner, admin, member.',
                    rest: 'Owners and admins keep the team and the book. Members quote from it, which is what most of a sales floor needs.',
                  },
                  {
                    lead: 'Nobody grants access above their own.',
                    rest: 'An admin who could invite an owner has made themselves an owner with a second email address, and every other check becomes decoration.',
                  },
                  {
                    lead: 'There is always an owner.',
                    rest: 'An organisation with no owner has nobody who can promote anybody: live data and no way back short of a database console. It refuses.',
                  },
                  {
                    lead: 'Refusals name the person.',
                    rest: '"Only an owner or an admin can change who is on the team" is something you can act on. An internal id is not, and never appears in front of anybody.',
                  },
                ]}
              />
            </div>
            <div className="mk-tintfield">
              <Card>
                <TeamPanel />
              </Card>
            </div>
          </Split>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* --------------------------------------------------------- record */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="The record"
            title="What did this person actually do"
            lead="Every action in the product goes through one place, and that place writes it down. Not a log file somebody has to go and read: a row on the job, whether the action succeeded or failed."
          />
          <FeatureGrid
            columns={4}
            cells={[
              {
                title: 'Every command, both ways',
                body: 'What was asked for, what came back, whether it worked and what the error was. A failed action is as much a part of the record as one that went through.',
                meta: 'Audit log',
              },
              {
                title: 'One path for everything',
                body: 'A toolbar button, a keyboard shortcut and a server action all run the same command. There is no second route that skips the write.',
              },
              {
                title: 'It tells you when it breaks',
                body: 'Errors are reported with the secrets stripped out, and the person on screen gets a short reference they can quote rather than a stack trace.',
                meta: 'err_<12 hex>',
              },
              {
                title: 'Quotes are reproducible',
                body: 'A quote stores the measurements, the selections and the price book version it was built from, so it can be rebuilt exactly months later.',
              },
            ]}
          />
        </div>
      </section>

      {/* ----------------------------------------------------------- gaps */}
      <section className="mk-block">
        <div className="mk-shell">
          <Gaps
            title="This runs the job. It does not run the build"
            items={[
              'Scheduling',
              'Service routing',
              'Job costing',
              'Purchase orders',
              'Time tracking',
              'A crew mobile app',
              'Daily logs',
              'Invoicing',
              'Accounting sync',
              'Reporting dashboards',
              'A sales pipeline',
              'Multiple locations',
              'A customer account portal',
              'A public API',
              'Invite emails that send themselves',
            ]}
          />
          <p className="mk-caption" style={{ marginTop: '1.5rem', maxWidth: '44rem' }}>
            Pool Forge ends at the signed proposal and the construction set. Everything
            after the dig belongs to whatever you already run, and there is no integration
            to it yet. Invites work, but with no mail provider configured an operator
            mints the link and passes it to you.
          </p>
        </div>
      </section>

      <ReadNext currentHref={HREF} />
    </div>
  )
}

function BusinessShapes() {
  return (
    <>
      <span
        className="mk-shape mk-shape--bite mk-anim-shape"
        style={{
          background: '#874FFF',
          width: '20rem',
          height: '20rem',
          right: '-7rem',
          top: '-7rem',
          ['--fly-x' as string]: '9rem',
          ['--fly-y' as string]: '-7rem',
        }}
      />
      <span
        className="mk-shape mk-shape--fan mk-anim-shape"
        style={{
          width: '14rem',
          height: '14rem',
          left: '-6rem',
          bottom: '-4rem',
          animationDelay: '0.08s',
          ['--fly-x' as string]: '-8rem',
        }}
      />
    </>
  )
}
