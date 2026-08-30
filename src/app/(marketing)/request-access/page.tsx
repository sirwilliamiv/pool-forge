// The front door.
//
// Pool Forge is invite only while it is early, so this is the page a builder
// lands on when they want in and cannot simply have it. It has two jobs: say
// what the software is, accurately enough that somebody who wants it recognises
// it, and take their details in a way that makes the limit read as deliberate.
//
// EVERY CLAIM ON THIS PAGE IS SOMETHING THE APP DOES TODAY.
//
// That is a hard rule, not a preference. A builder who arrives expecting what
// is written here and finds something else is a beta customer lost in the first
// ten minutes, and there are only a few of them. Specifically: no photoreal
// rendering, no LiDAR capture, no e-signature service, no
// financing, no accounting sync, no drawing on a phone. Those gaps are
// recorded in `docs/feature-list.md`, so the honesty survives off the page.
//
// Before changing a word here, check it against the running app.
//
// ── On the shape of this page ──────────────────────────────────────────────
//
// Built to `docs/brand-bible.md` like the three product pages, on the Signal
// family. Green is the only core hue the bible lets run full-bleed as a
// surface, which suits the way in; it is free here because the announcement
// bar, which is the other green thing, hides itself on its own destination.
//
// Two things in here are load-bearing for `src/test/e2e/waitlist.spec.ts` and
// must not be reworded: the `<h1>`, the phrase "Invite only while it is early",
// and the heading "Why access is limited".

import type { Metadata } from 'next'
import Link from 'next/link'

import { FeatureGrid, PointList, SectionHead, Split } from '@/components/marketing/blocks'
import { MonsteraLeaf, PalmFrond } from '@/components/marketing/botanicals'
import {
  EXAMPLE_LINES,
  EXAMPLE_POOL,
  EXAMPLE_SUBTOTAL_CENTS,
  EXAMPLE_TAX_CENTS,
  EXAMPLE_TAX_LABEL,
  EXAMPLE_TOTAL_CENTS,
  money,
} from '@/components/marketing/example'
import { MeasurementsPanel, Pip, Plate, PlanSheet } from '@/components/marketing/plates'
import { WaitlistForm } from './waitlist-form'

export const metadata: Metadata = {
  title: 'Request access · Pool Forge',
  description:
    'Estimating software for pool builders. Draw the pool and it prices itself from your price book, then prints the proposal and the construction set. Invite only while it is early.',
}

export default function RequestAccessPage() {
  return (
    <div className="mk" data-accent="signal">
      {/* ─────────────────────────────── Hero ─────────────────────────────── */}
      {/* The form is the composition's second plane rather than a screenshot of
          one. It is the thing the page is for, and a decorative panel sitting
          where the working one should be would be a strange choice. */}
      <section className="mk-hero mk-hero--static">
        <div className="mk-hero__stage">
          {/* Botanical rather than geometric, and only here. The front door is
              about the finished yard; the product pages are about the tool, and
              they stay on the hard-edged shapes. One accent language per
              composition, so there is not a checkerboard in this frame. */}
          <div className="mk-shapes" aria-hidden>
            <span className="mk-hero__tint" />
            <MonsteraLeaf
              id="hero-a"
              className="mk-botanical mk-anim-shape"
              style={{
                width: '26rem',
                height: '29rem',
                right: '-5rem',
                top: '-5.5rem',
                transform: 'rotate(16deg)',
                color: 'var(--brand-green)',
                ['--fly-x' as string]: '9rem',
                ['--fly-y' as string]: '-7rem',
              }}
            />
            <PalmFrond
              className="mk-botanical mk-anim-shape"
              style={{
                width: '25rem',
                height: '26rem',
                left: '-9rem',
                bottom: '-13rem',
                transform: 'rotate(-26deg)',
                color: 'var(--tint-sage)',
                animationDelay: '0.08s',
                ['--fly-x' as string]: '-8rem',
              }}
            />
          </div>

          <div className="mk-shell mk-hero__layout">
            <div className="mk-hero__head mk-anim-head">
              <p className="mk-hero__eyebrow mk-label mk-label--ink">
                <span className="mk-fan" aria-hidden />
                Invite only while it is early
              </p>
              <h1 className="mk-display1">Draw the pool. The price is already done.</h1>
              <p className="mk-hero__lead mk-lead">
                Pool Forge is estimating software for pool builders. You draw the job in your
                browser and it prices itself from your own price book while you draw. The customer
                proposal and the construction set come out of that same drawing, so they cannot
                disagree with it.
              </p>

              <PointList
                points={[
                  {
                    lead: 'Your price book, imported.',
                    rest: 'From the spreadsheet you already keep. Each import lands as a new version, so the last one stays intact.',
                  },
                  {
                    lead: 'One book for the whole company.',
                    rest: 'Your salespeople quote from the current version instead of the copy you emailed out in March.',
                  },
                  {
                    lead: 'Send the proposal as a link.',
                    rest: 'The customer opens it on their phone, with nothing to install, and accepts it there.',
                  },
                ]}
              />

              <p className="mk-caption" style={{ marginTop: '1.75rem' }}>
                Screen enclosures are part of it, not an afterthought.
              </p>
            </div>

            <div className="mk-hero__plate mk-anim-plate">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────── The drawing, and the money ────────────────── */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="The thing itself"
            title="And the quote, at the same moment"
            lead="Every measurement below feeds line items priced from your book. Heater, salt system, lights and a screen enclosure are choices that move the same total, and your sales tax is applied on every surface that prints a number."
          />

          {/* No tint field here: the plate runs the full width of the shell, so
              the band would peek out as two stripes at the edges rather than
              read as something the card straddles. */}
          <div style={{ marginTop: '3rem' }}>
            <Pip
              base={
                <Plate
                  title={`Example job · ${EXAMPLE_POOL.width} × ${EXAMPLE_POOL.length}`}
                  meta="Plan"
                  bodyPad={false}
                >
                  <div style={{ padding: '0.5rem 0.75rem 1.25rem', color: 'var(--fg)' }}>
                    <PlanSheet />
                  </div>
                </Plate>
              }
              inset={<MeasurementsPanel />}
            />
          </div>

          <p className="mk-caption" style={{ marginTop: '3.5rem', maxWidth: '44rem' }}>
            The measurements are read off the drawing, not typed in beside it. Change the pool and
            all of them change with it.
          </p>

          <div className="mk-split" style={{ marginTop: '3rem' }}>
            <div>
              <h3 className="mk-title3">What that prices out to</h3>
              <p className="mk-body" style={{ marginTop: '1rem' }}>
                Six lines, the units they are sold in, and a total that is the sum of them rather
                than a number somebody typed at the bottom.
              </p>
              <p className="mk-caption" style={{ marginTop: '1.5rem' }}>
                Example figures. The lines, the units and the prices come from your book, not ours.
              </p>
            </div>

            <div>
              <table className="mk-table">
                <caption className="mk-sr-only">
                  Example quote lines produced from the drawing
                </caption>
                <tbody>
                  {EXAMPLE_LINES.map((line) => (
                    <tr key={line.label}>
                      <td>{line.label}</td>
                      <td className="mk-table__num mk-table__muted">{line.qty}</td>
                      <td className="mk-table__num">{money(line.cents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Subtotal</td>
                    <td className="mk-table__num">{money(EXAMPLE_SUBTOTAL_CENTS)}</td>
                  </tr>
                  <tr className="mk-table__muted">
                    <td colSpan={2}>{EXAMPLE_TAX_LABEL}</td>
                    <td className="mk-table__num">{money(EXAMPLE_TAX_CENTS)}</td>
                  </tr>
                  <tr className="mk-table__total">
                    <td colSpan={2}>Total</td>
                    <td className="mk-table__num">{money(EXAMPLE_TOTAL_CENTS)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />

      {/* ───────────────────────── What it does today ─────────────────────── */}
      <section className="mk-block mk-block--major">
        <div className="mk-shell">
          <SectionHead
            eyebrow="Today"
            title="What it does today"
            lead="All of it, in the browser. Nothing to install, no graphics card to buy, no Windows requirement."
          />
          <FeatureGrid
            columns={3}
            cells={[
              {
                title: 'Priced while you draw',
                body: 'Pull the pool to 32 by 16 and the surface area, perimeter, gallons, deck area and coping run change with it. Each of those feeds line items from your price book, and the running total in the corner moves as you work. No takeoff sheet, no second pass.',
              },
              {
                title: 'Your price book, not ours',
                body: 'Import the Excel you already keep: upload it, map your columns, check the preview, save. It lands as a new version rather than piling on top of the last one, the version it replaced stays readable, and a saved quote records which version priced it. A wrong file is something you can back out of.',
              },
              {
                title: 'One book, no copies',
                body: 'Everyone in your company quotes from the current version of one book. There is no file to email around and no way for somebody to be working from a stale copy of it.',
              },
              {
                title: 'Documents from the drawing',
                body: 'A customer proposal, a construction packet at 11 by 17, a site plan, and a screen enclosure RFQ, all generated from the same project. Print them, or save them as PDF from the browser.',
              },
              {
                title: 'Checked before it leaves',
                body: 'Seventeen rules read the project and the drawing: a customer with no address on file, a deep end shallower than the shallow end, a deck drawn with no material chosen, a proposal with no expiry date, a quote that totals nothing. They flag it while you can still fix it.',
                meta: '17 rules',
              },
              {
                title: 'The last mile',
                body: 'Send the proposal as a link. The customer opens it in any browser, on a phone, with nothing to log into, and accepts it by typing their name. The copy they accepted is stored exactly as it was sent. Before that, you can send them an upload link and get their photos, a sketch or the survey back attached to a draft project.',
              },
            ]}
          />
        </div>
      </section>

      <hr className="mk-rule" />

      {/* ───────────────────────── Why it is closed ───────────────────────── */}
      {/* Prose runs to a 46rem measure, which leaves the right half of a wide
          viewport empty. That half is where the accent composition goes: three
          flat shapes overlapping each other and cropping off the edge, which is
          what the bible asks decoration to do rather than sit centred in a box. */}
      <section className="mk-block mk-block--major">
        <div className="mk-decor" aria-hidden>
          {/* Overlapping, and running off the right edge. A shape that fits
              tidily inside the column is decoration; one that crops is the
              composition doing its job. */}
          <span
            className="mk-shape mk-shape--fan"
            style={{ width: '24rem', height: '24rem', right: '-8rem', top: '-4rem' }}
          />
          <span
            className="mk-shape mk-shape--check"
            style={{
              ['--shape-color' as string]: 'var(--tint-lilac)',
              width: '18rem',
              height: '11rem',
              right: '4rem',
              top: '44%',
            }}
          />
          <span
            className="mk-shape mk-shape--bite"
            style={{
              background: 'var(--brand-green)',
              width: '19rem',
              height: '19rem',
              right: '-5rem',
              bottom: '-6rem',
            }}
          />
        </div>
        <div className="mk-shell">
          <div style={{ maxWidth: '46rem' }}>
            <p className="mk-label mk-label--ink" style={{ marginBottom: '1.5rem' }}>
              The limit
            </p>
            <h2 className="mk-title1">Why access is limited</h2>
            <p className="mk-lead" style={{ marginTop: '1.5rem' }}>
              We are letting builders in a few at a time, and it is not a growth tactic. Everyone
              who comes in gets their price book loaded with us and a direct line while the product
              is still taking its shape from what they tell us. That is real work per company, and
              doing it badly for fifty is worse than doing it properly for a handful.
            </p>
            <p className="mk-lead" style={{ marginTop: '1.25rem' }}>
              What you get for being early is the part that does not scale: the software gets built
              around how you actually quote, by people who answer the phone. When we can do that
              well for more builders, we will open it up.
            </p>
            <div style={{ marginTop: '2.5rem' }}>
              <Link href="#request-access" className="mk-btn mk-btn--primary">
                Ask for access
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
