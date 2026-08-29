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
// rendering, no LiDAR capture, no voice agent, no e-signature service, no
// financing, no accounting sync, no drawing on a phone. The section headed
// "What it does not do yet" says all of that out loud, because the people who
// need it to do those things are better off knowing now.
//
// Before changing a word here, check it against the running app.

import type { Metadata } from 'next'
import Link from 'next/link'

import { WaitlistForm } from './waitlist-form'

export const metadata: Metadata = {
  title: 'Request access · Pool Forge',
  description:
    'Estimating software for pool builders. Draw the pool and it prices itself from your price book, then prints the proposal and the construction set. Invite only while it is early.',
}

/** Illustration figures. A 32 by 16 pool at an average depth of 5 ft. */
const EXAMPLE_LINES: ReadonlyArray<{ label: string; qty: string; amount: string }> = [
  { label: 'Excavation and haul off', qty: '512 sq ft', amount: '$6,144.00' },
  { label: 'Shotcrete shell', qty: '512 sq ft', amount: '$10,240.00' },
  { label: 'Pebble interior finish', qty: '512 sq ft', amount: '$8,704.00' },
  { label: 'Travertine coping', qty: '96 lf', amount: '$4,320.00' },
  { label: 'Paver deck', qty: '600 sq ft', amount: '$9,000.00' },
  { label: 'Heater, 400k BTU', qty: '1 ea', amount: '$4,850.00' },
]

function PlanDrawing() {
  return (
    <svg
      viewBox="0 0 440 300"
      role="img"
      aria-label="Plan view of a 32 by 16 foot pool with a paver deck, coping band and dimension lines"
      className="h-auto w-full"
    >
      <defs>
        <pattern id="deck-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" stroke="#CBD5E1" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Deck */}
      <rect x="24" y="52" width="392" height="216" rx="10" fill="url(#deck-hatch)" opacity="0.7" />
      <rect
        x="24"
        y="52"
        width="392"
        height="216"
        rx="10"
        fill="none"
        stroke="#94A3B8"
        strokeWidth="1.5"
      />

      {/* Coping band */}
      <rect x="86" y="92" width="268" height="136" rx="12" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.5" />

      {/* Water */}
      <rect x="98" y="104" width="244" height="112" rx="8" fill="#E0F2FE" stroke="#0E9DE5" strokeWidth="2" />

      {/* Entry steps, shallow end */}
      <path d="M98 104 h44 v112 h-44 z" fill="#FFFFFF" opacity="0.55" />
      <path d="M112 104 v112 M126 104 v112" stroke="#0E9DE5" strokeWidth="1" opacity="0.7" />

      {/* Length dimension */}
      <g stroke="#64748B" strokeWidth="1">
        <path d="M98 74 h244" />
        <path d="M98 68 v12 M342 68 v12" />
      </g>
      <rect x="196" y="62" width="48" height="18" rx="4" fill="#EEF2F4" />
      <text x="220" y="75" textAnchor="middle" fontSize="12" fill="#334155">
        32&#39;-0&quot;
      </text>

      {/* Width dimension */}
      <g stroke="#64748B" strokeWidth="1">
        <path d="M376 104 v112" />
        <path d="M370 104 h12 M370 216 h12" />
      </g>
      <rect x="352" y="151" width="48" height="18" rx="4" fill="#EEF2F4" />
      <text x="376" y="164" textAnchor="middle" fontSize="12" fill="#334155">
        16&#39;-0&quot;
      </text>

      {/* Depth callout */}
      <text x="316" y="196" textAnchor="end" fontSize="11" fill="#64748B">
        3&#39;-6&quot; to 6&#39;-6&quot;
      </text>
    </svg>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-pfMd border border-borderLight bg-background px-4 py-3">
      <div className="text-lg font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-xs uppercase tracking-wide text-textMuted">{label}</div>
    </div>
  )
}

function Feature({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-pfLg border border-borderLight bg-background p-6 shadow-pfXs">
      <div className="text-xs font-semibold tabular-nums text-pfAccentStrong">{index}</div>
      <h3 className="mt-2 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-textMuted">{children}</p>
    </div>
  )
}

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <header className="border-b border-borderLight bg-background">
        <div className="container flex h-14 items-center justify-between">
          <span className="font-semibold tracking-tight">Pool Forge</span>
          <Link
            href="/login"
            className="text-sm text-textMuted underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main>
        {/* ─────────────── Hero ─────────────── */}
        <section className="container grid gap-10 py-10 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
          <div className="max-w-xl">
            <span className="inline-flex items-center rounded-full bg-pfAccentSoft px-3 py-1 text-xs font-medium tracking-wide text-pfAccentStrong">
              Invite only while it is early
            </span>
            <h1 className="mt-5 text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Draw the pool. The price is already done.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-textMuted sm:text-lg">
              Pool Forge is estimating software for pool builders. You draw the job in your browser
              and it prices itself from your own price book while you draw. The customer proposal
              and the construction set come out of that same drawing, so they cannot disagree with
              it.
            </p>
            <ul className="mt-8 space-y-3 text-sm leading-relaxed">
              <li className="flex gap-3">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-pfAccent" />
                <span>
                  Your price book, imported from the spreadsheet you already keep. Each import
                  lands as a new version, so the last one stays intact.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-pfAccent" />
                <span>
                  One book for the whole company. Your salespeople quote from the current version
                  instead of the copy you emailed out in March.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-pfAccent" />
                <span>
                  Send the proposal as a link. The customer opens it on their phone, with nothing to
                  install, and accepts it there.
                </span>
              </li>
            </ul>
            <p className="mt-8 text-sm text-textMuted">
              Screen enclosures are part of it, not an afterthought.
            </p>
          </div>

          <div className="lg:pt-4">
            <WaitlistForm />
          </div>
        </section>

        {/* ─────────────── The thing itself ─────────────── */}
        <section className="border-y border-borderLight bg-background">
          <div className="container grid gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
            <div>
              <div className="rounded-pfLg border border-borderLight bg-canvas p-5">
                <PlanDrawing />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat value="512" label="sq ft surface" />
                <Stat value="96" label="lf perimeter" />
                <Stat value="19,150" label="gallons" />
                <Stat value="600" label="sq ft deck" />
              </div>
              <p className="mt-3 text-xs text-textMuted">
                The measurements are read off the drawing, not typed in beside it. Change the pool
                and all four change with it.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                And the quote, at the same moment
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-textMuted">
                Every measurement above feeds line items priced from your book. Heater, salt system,
                lights and a screen enclosure are choices that move the same total. Your sales tax
                is applied on every surface that prints a number.
              </p>
              <div className="mt-6 overflow-hidden rounded-pfMd border border-borderLight">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Example quote lines produced from the drawing
                  </caption>
                  <tbody>
                    {EXAMPLE_LINES.map((line) => (
                      <tr key={line.label} className="border-b border-borderLight last:border-0">
                        <td className="px-3 py-2">{line.label}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-textMuted">
                          {line.qty}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {line.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-rowHover">
                    <tr>
                      <td className="px-3 py-2" colSpan={2}>
                        Subtotal
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">$43,258.00</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-textMuted" colSpan={2}>
                        Sales tax, 7%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-textMuted">
                        $3,028.06
                      </td>
                    </tr>
                    <tr className="border-t border-borderLight font-semibold">
                      <td className="px-3 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">$46,286.06</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-3 text-xs text-textMuted">
                Example figures. The lines, the units and the prices come from your book, not ours.
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────── What it does today ─────────────── */}
        <section className="container py-16">
          <h2 className="text-2xl font-semibold tracking-tight">What it does today</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-textMuted">
            All of it, in the browser. Nothing to install, no graphics card to buy, no Windows
            requirement.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Feature index="01" title="Priced while you draw">
              Pull the pool to 32 by 16 and the surface area, perimeter, gallons, deck area and
              coping run change with it. Each of those feeds line items from your price book, and
              the running total in the corner moves as you work. No takeoff sheet, no second pass.
            </Feature>

            <Feature index="02" title="Your price book, not ours">
              Import the Excel you already keep: upload it, map your columns, check the preview,
              save. It lands as a new version rather than piling on top of the last one, the
              version it replaced stays readable, and a saved quote records which version priced
              it. A wrong file is something you can back out of.
            </Feature>

            <Feature index="03" title="One book, no copies">
              Everyone in your company quotes from the current version of one book. There is no file
              to email around and no way for somebody to be working from a stale copy of it.
            </Feature>

            <Feature index="04" title="Documents from the drawing">
              A customer proposal, a construction packet at 11 by 17, a site plan, and a screen
              enclosure RFQ, all generated from the same project. Print them, or save them as PDF
              from the browser.
            </Feature>

            <Feature index="05" title="Checked before it leaves">
              Seventeen rules read the project and the drawing: a customer with no address on file,
              a deep end shallower than the shallow end, a deck drawn with no material chosen, a
              proposal with no expiry date, a quote that totals nothing. They flag it while you can
              still fix it.
            </Feature>

            <Feature index="06" title="The last mile">
              Send the proposal as a link. The customer opens it in any browser, on a phone, with
              nothing to log into, and accepts it by typing their name. The copy they accepted is
              stored exactly as it was sent. Before that, you can send them an upload link and get
              their photos, a sketch or the survey back attached to a draft project.
            </Feature>
          </div>
        </section>

        {/* ─────────────── The honest part ─────────────── */}
        <section className="border-y border-borderLight bg-background">
          <div className="container grid gap-10 py-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">What it does not do yet</h2>
              <p className="mt-3 text-sm leading-relaxed text-textMuted">
                Better you know now than in your first week. If one of these is the thing you were
                hoping for, tell us in the form and we will say honestly where it sits.
              </p>
            </div>
            <ul className="space-y-4 text-sm leading-relaxed">
              <li className="border-l-2 border-borderLight pl-4">
                <span className="font-medium">The 3D is schematic, not photoreal.</span>{' '}
                <span className="text-textMuted">
                  It is clean, and it is for reading shape, scale and layout. It will not out-render
                  Pool Studio, and we are not going to pretend otherwise on a landing page.
                </span>
              </li>
              <li className="border-l-2 border-borderLight pl-4">
                <span className="font-medium">Acceptance is a typed name, not an e-signature.</span>{' '}
                <span className="text-textMuted">
                  The customer accepts on the shared proposal and the accepted copy is kept as sent.
                  It is not DocuSign, and we do not call it that.
                </span>
              </li>
              <li className="border-l-2 border-borderLight pl-4">
                <span className="font-medium">No financing, accounting sync, or CRM.</span>{' '}
                <span className="text-textMuted">
                  No monthly payment under the total, no QuickBooks, no pipeline. It estimates and
                  it produces documents.
                </span>
              </li>
              <li className="border-l-2 border-borderLight pl-4">
                <span className="font-medium">Drawing wants a laptop.</span>{' '}
                <span className="text-textMuted">
                  Your customer reads the proposal fine on a phone. You will not be drawing a pool
                  on one.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ─────────────── Why it is closed ─────────────── */}
        <section className="container py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight">Why access is limited</h2>
            <div className="mt-4 space-y-4 text-base leading-relaxed text-textMuted">
              <p>
                We are letting builders in a few at a time, and it is not a growth tactic. Everyone
                who comes in gets their price book loaded with us and a direct line while the
                product is still taking its shape from what they tell us. That is real work per
                company, and doing it badly for fifty is worse than doing it properly for a handful.
              </p>
              <p>
                What you get for being early is the part that does not scale: the software gets
                built around how you actually quote, by people who answer the phone. When we can do
                that well for more builders, we will open it up.
              </p>
            </div>
            <div className="mt-8">
              <a
                href="#request-access"
                className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Ask for access
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-borderLight bg-background">
        <div className="container flex flex-col gap-2 py-6 text-sm text-textMuted sm:flex-row sm:items-center sm:justify-between">
          <span>Pool Forge, estimating software for pool builders.</span>
          <Link href="/login" className="underline-offset-4 hover:text-foreground hover:underline">
            Already have an account? Sign in
          </Link>
        </div>
      </footer>
    </div>
  )
}
