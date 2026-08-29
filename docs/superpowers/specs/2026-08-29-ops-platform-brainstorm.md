# Beyond the diff: closing the business half

Status: brainstorm. Nothing here is committed scope until it graduates into
`docs/build-priority.md`. This doc exists because the market diff
(2026-08-29) showed six honest gaps, all on the "business half" of the
market, and the owner wants each one researched with an implementation
shape before deciding order.

## The ideas, as raised

Captured before any research so the research cannot quietly rewrite them:

1. All six honest gaps from the diff, each researched to an implementation
   shape: photoreal rendering, customer financing, leads/CRM, scheduling and
   jobs, team roles, service/routes.
2. An iOS + Android app so an employee in the field has GPS + route tracking.
3. Cost vs retail everywhere it is not yet (margin/markup is still a gap).
4. Change order management.
5. Subcontractor management, with lien waivers (open question raised: are
   lien waivers even a thing in pool construction?), and a "decision memory":
   possibly audio from calls, so anyone can recall what was decided, when,
   and where.
6. Stripe: which products enable financing, fast payments, and invoicing.
7. Overall project management: N stages per project, and the stage pipeline
   itself buildable by the builder in a node workflow canvas, n8n-style.
8. Scheduling for both staff and jobs. CRM. Routes.

## Research findings

Each track below was researched by a dedicated agent against 2026 sources
on 2026-08-29. External claims carry links; anything an agent could not
verify is marked unverified. The section after the tracks turns the
findings into waves.

### Track 1 · Field app (iOS + Android, GPS + routes)

**Verdict: Capacitor wrapping the existing Next.js app, with Transistorsoft's
`capacitor-background-geolocation`.** One codebase, the command registry and
Zod boundaries come along for free, and only GPS/camera/offline is native.
Expo/RN is the better product long-term but is a second codebase; a PWA is
ruled out flat: iOS Safari has no background geolocation of any kind
([Brainhub](https://brainhub.eu/library/pwa-on-ios),
[MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)).

**The tracking model that passes App Store review and Florida law:**

- Apple has rejected apps whose background location exists solely to track
  employees (Guideline 2.5.4,
  [rejection thread](https://developer.apple.com/forums/thread/118275)).
  The pattern that passes: **geofence arrive/depart events per job site,
  plus tracking only while clocked in**, framed as timesheet and mileage
  features for the employee. This is exactly what the market ships: Jobber
  geofences a ~200m "location timer" and logs GPS waypoints only at timer
  start/stop, explicitly disclaiming live tracking
  ([Jobber](https://help.getjobber.com/en/articles/location-timers-in-the-jobber-app/));
  QuoteIQ is the aggressive end, live pin-on-map **only while clocked in**
  ([QuoteIQ](https://myquoteiq.com/features/location-tracking/)); JobTread
  just geo-stamps clock events
  ([JobTread](https://www.jobtread.com/features/time-tracking)).
- Florida permits tracking company devices without consent, but crews use
  **personal phones, which require consent**, and tracking must not extend
  past work hours ([Timeero state
  guide](https://timeero.com/resources-page/employee-gps-tracking-laws)).
  Consent flow and a hard off-the-clock cutoff are product features, not
  paperwork. Retention: GPS-stamped time entries 3 years (FLSA payroll
  horizon), raw breadcrumbs purged at ~90 days.

**Construction-crew minimum (not maintenance routes):** today's jobs by
phase; tap-for-directions handing off to Apple/Google Maps (never build
nav); geofenced clock-in/out; photo + daily log with an **offline queue**
(job sites lack signal; Pool Brain sells offline-first as a headline);
punch lists with photo-verify; foreman clocks in the whole crew. Everything
dispatches through the command registry like the web app.

**Phases:** (1) Capacitor shell + auth + today's-jobs/photos offline;
(2) geofenced clock-in/out + consent (Jobber model, no "Always"-permission
risk); (3) opt-in clocked-in-only breadcrumbs + owner map + purge job;
(4) punch lists, daily logs, crew clock-in.

### Track 2 · Subcontractor management, lien waivers, decision memory

**Do pools do lien waivers? Yes, emphatically, in exactly our market.**
Florida's Construction Lien Law (F.S. ch. 713) applies to any improvement
over $5,000. A sub or supplier who served a Notice to Owner can lien the
homeowner's property **even after the homeowner paid the builder in full**;
payments made without collecting waivers are "improper" and the owner can
be forced to pay twice
([F.S. 713.20](https://law.justia.com/codes/florida/2020/title-xl/chapter-713/part-i/section-713-20/),
[Douglas Firm FAQ](https://douglasfirm.com/florida-lien-machine/construction-lien-faqs/)).
It is not theoretical: a Tampa-area pool company collapse left ~60
unfinished pools with subs liening homeowners who had already paid
([WFLA](https://www.wfla.com/8-on-your-side/better-call-behnken/pool-company-tells-customers-it-plans-to-file-for-bankruptcy-leaving-60-pools-unfinished/)).
F.S. 713.20 defines four statutory forms (conditional/unconditional x
progress/final); the forms are static text with merge fields, which the
existing HTML-to-PDF export pipeline can produce as new document kinds
beside the screen-enclosure RFQ. Texas and California have their own
mandatory statutory forms (statute cites unverified; consistent with
[Levelset](https://www.levelset.com/lien-waivers/)), so waiver templates
are per-state data, Florida first.

**Retainage: mostly absent in residential pools.** Subs are paid per
completed phase and the phase is the quality gate. A simple holdback field
covers the rare case; do not build AIA pay apps or retainage first.

**The audio idea has a felony in it, and a better shape next to it.**
Florida is **all-party consent** (F.S. 934.03): recording a call without
every party's consent is a third-degree felony, participant status is no
defense
([Recording Law FL](https://www.recordinglaw.com/party-two-party-consent-states/florida-recording-laws/)).
Silent call capture must never be built. The legally safe shape that
delivers the actual want ("recall what was decided, when, where"):

- **Decision Log.** A post-call voice memo where the builder records
  *themselves* summarizing ("Aug 29, told Rick at Gulf Gunite to move the
  shoot to Tuesday, $850 pump add approved"): zero consent issue. Plus
  on-site voice notes attached to the project (the CompanyCam pattern).
  Transcribe, extract {decision, party, amount, date, phase}, and render a
  searchable immutable timeline per project and per sub. The existing
  `VoiceSession` model is a natural base. This is also better evidence
  hygiene than raw call audio. A disclosed recorded line ("this call is
  recorded") is legal and can come later, if ever.

**Minimum lovable for a 5-30-sub builder, in order:** sub directory
(trade, license, W-9, COI with expiry warnings, paid-YTD for 1099 totals);
RFQ/bid packages generalized from the screen-enclosure export; PO from
accepted bid tied to a project phase; **payment gated on waiver** (paid
only after the conditional waiver generates, flipped unconditional when
payment clears, NTOs stored against the project); phase scheduling with
SMS/email notify; the Decision Log. Skip: retainage, AIA, sub portal
logins. Comparable stacks: JobTread's vendor management + HoundDog COI
automation, Procore Pay's waiver-gated invoicing
([JobTread](https://www.jobtread.com/features/vendor-and-subcontractor-management),
[Procore Pay](https://support.procore.com/products/online/procore-pay/tutorials/manage-lien-waivers-on-project-invoices)).

**Fit:** org-scoped models (`Subcontractor`, `SubDocument`, `BidPackage`,
`PurchaseOrder`, `LienWaiver`, `NoticeToOwner`, `DecisionNote`), commands
(`sub.create`, `bid.request`, `po.issue`, `payment.release` which
*requires* a waiver row, `decision.capture`), all audit-logged, which for
payment events is the point.

### Track 3 · Project management: N stages, builder-composable, n8n-style

**The differentiator claim checks out: no construction or pool vertical
ships a node-graph workflow builder.** Buildertrend has template Gantt
schedules with dependency cascade, JobTread a basic Gantt, Poologics
ordered checklist templates: none has a user-composable automation graph
([Buildertrend](https://buildertrend.com/library/construction-scheduling-guide/),
[Poologics](https://www.poologics.com/pool-construction-business-software-features)).
Generic tools (n8n, monday.com automations) get bolted on from outside.

**The real pipeline, verified against builder sources and Florida permit
checklists:** design/contract → permit → layout → excavation → steel →
plumbing/electric rough (inside the steel window) → gunite → cure (~28
days before tile) → tile & coping → deck → equipment set → plaster
(deliberately last) → fill same day → punch/handover. Critically, Florida
municipalities **hard-gate stages with inspections**: steel + bonding
before shotcrete, plumbing pressure test, deck bond before pour, final
barrier compliance
([Ocoee](https://www.ocoee.org/DocumentCenter/View/1282/Swimming-Pools-Inspection-Requirements-PDF),
[Nassau County](https://nassaucountyfl.com/DocumentCenter/View/15812/Residential-Swimming-Pool-checklist)).
So a stage node needs `blocked awaiting inspection` as a distinct state:
gates are nodes, not decorations.

**Engine: a DAG interpreter over Postgres rows, not Temporal.** Durable
execution engines buy replay semantics that human actions taking days do
not need. The engine is a reducer: on event, find satisfied nodes,
activate, fire triggers. **Triggers dispatch through the existing command
registry** (`dispatchCommand`), which hands every automated action Zod
validation, org scoping and a `CommandAuditLog` row for free, with a new
`source: 'workflow'`. That audit trail is the answer to "why did the sub
get texted at 6am". Model sketch: versioned `WorkflowTemplate`;
`StageNode` (kind: stage | gate | milestone); `StageEdge` (AND-join only:
a pool build is a DAG, no OR-joins in v1); `StageTrigger` (on
enter/complete/blocked → command + input template); `ProjectWorkflow`
pinning a template version so edits never mutate live jobs;
`ProjectStageInstance` carrying per-job deviations (skip a stage, insert a
rain delay). Delayed triggers ("3 days after gunite, remind about cure
watering") via **pg-boss**, a Postgres-backed queue, no new infra. Stage
completion is itself a command, so "mark gunite done" works by voice on
day one.

**Canvas: React Flow (@xyflow/react), still MIT in 2026**
([xyflow](https://xyflow.com/open-source)). Full n8n-like canvas ≈ 4-6
weeks. **v1 in ~1-1.5 weeks: a vertical drag-ordered stage list with
parallel groups and per-stage trigger pickers that writes the same
graph-shaped model**, so the canvas becomes a later view swap, not a
migration. Ship the data model graph-shaped now, the editor list-shaped
first.

**The scope trap, named:** do not build a Gantt/scheduling engine.
Auto-cascading date math, crew capacity, weather rescheduling, critical
path: that is Buildertrend's decade-deep moat and orthogonal to the graph.
Stage instances get started/completed facts and optional target dates;
date *optimization* stays out. Cycle-detection errors must name stages,
never node ids (standing convention).

### Track 4 · Photoreal rendering (the one design-half gap)

**Order: server-side Cycles first, geometry-locked AI as fast-follow,
browser path tracing never as a promise.**

- **Path B, server Cycles, is the ship-now answer** and is literally
  Cedreo's architecture (cloud farm, ~5-minute stills, credit-metered, no
  client GPU). Pipeline: the existing R3F scene → glTF export → headless
  Blender with a curated material library (real water shader, HDRI sky,
  vegetation assets) → still. Compute is ~**$0.02-0.05 per render** on
  spot RTX 4090s ($0.29-0.39/hr,
  [getdeploying](https://getdeploying.com/gpus/nvidia-rtx-4090));
  turnaround estimate needs a benchmark on real scenes (unverified). One
  autoscaling spot worker ≈ $50-250/mo at beta volume. Nobody sells
  "glTF in, archviz still out" as a turnkey API; that thin layer would be
  ours ([blenderless](https://github.com/oqton/blenderless)).
- **Path C alone is contractually dangerous.** Pure img2img
  (MyPoolDesigner.ai is exactly this: commodity Replicate presets,
  4.5/5 sizzle, zero dimensional fidelity, its own UI warns features "may
  not appear") redraws the waterline and coping. The pool shape is
  contractual; free-running diffusion cannot be the render of *the*
  design.
- **The hybrid is feasible now:** render depth + normals + edges from the
  real scene, condition FLUX.2 ControlNet-Union (~0.65-0.8 scale), and
  composite AI output **only outside a mask of the pool shell and
  coping**, keeping the true pool pixels authoritative
  ([FLUX.2 ControlNet](https://huggingface.co/alibaba-pai/FLUX.2-dev-Fun-Controlnet-Union);
  compositing recipe is synthesis, unverified in production). ~$0.01-0.08
  per image. Ship as a "dream mode" layer on Path B's output.
- **Path A, browser path tracing:** three-gpu-pathtracer is pre-1.0 and
  mid-migration to WebGPU, which iOS Safari still excludes; water caustics
  on integrated GPUs are the worst case. Keep as a designer-only preview
  someday; never gate customer deliverables on the client's GPU, which is
  the incumbent's mistake being exploited.
- **Standing rule:** renders are illustrative; the dimensioned plan sheet
  and quote are the contract. AI-touched images carry a "vegetation,
  furniture, lighting may vary" line, never a dimension disclaimer.

### Track 5 · Stripe: payments, invoicing, financing

**The fee table decides the architecture.** A $30k draw on a card costs
$870 (2.9% + 30¢). On **Stripe ACH Direct Debit it costs $5** (0.8%
capped at $5,
[Stripe](https://support.stripe.com/questions/ach-direct-debit-pricing)).
So: ACH debit is the workhorse; cards allowed only below a configurable
ceiling (~$5k deposits); **bank transfer via `customer_balance`** (Stripe
issues a virtual account number, auto-reconciles, no return risk, no
percentage fee) is the fallback for six-figure finals. Buildertrend
Payments confirms the pattern (capped-fee ACH + cards for small amounts).

**The operational gotcha to design for:** new Stripe accounts start with
low ACH limits (~$6k/day for ~120 days, account-specific, unverified
exact numbers): each builder must request increases at onboarding or a
$30k draw bounces. Make it an onboarding checklist item. Stripe still has
no FedNow/RTP acceptance as of mid-2026; T+2 ACH settlement
(eligibility-gated) plus optional Instant Payouts (1.5%) is the
fast-money story.

**v1 stack:** Connect (**Standard accounts, direct charges**: each
builder is merchant of record, holds their own limits and disputes, Pool
Forge can take an application fee) + Payments + **Invoicing** (0.4-0.5%
capped at $2 per paid invoice: one invoice per milestone, generated from
the project's draw schedule, which ties directly into Track 3's
`invoice.releaseDraw` trigger) + Financial Connections + Radar. Skip
Billing (subscriptions don't fit milestones; Stripe's native payment
plans are private preview), Identity, Terminal. Effort ≈ 2-4 weeks.

**Consumer financing: referral-first, not embedded.** Affirm-via-Stripe
caps at $30k, too low. The real pool-financing market:
**HFS Financial** (unsecured to ~$500k, **zero dealer fees**, free
embeddable widget), Lyon Financial (to $200k, stage-funded), Viking
Capital: none publish a true API; integration is widget/referral on the
proposal PDF, which is days of work. **Wisetack** raised its cap to $65k
in June 2026 with a 3.9% merchant fee and does embed (the Jobber model):
add later for the sub-$65k segment. **Stripe Capital** can later finance
the *builders* through a branded Connect program once they process
through the platform: a revenue line, not v1.

### Track 6 · CRM, scheduling, routes

**Market event first, found during this research: Skimmer acquired
Poologics AND Pool Builder Geek on 2026-08-24**
([Pool Magazine](https://www.poolmagazine.com/industry-news/skimmer-acquires-pool-builder-geek-poologics/amp/)).
The service-routing side is buying its way into construction: the
dossier's "Pool Brain is a different business" wall is being crossed from
the other direction. Expect Poologics roadmap churn and price moves
during integration. This is a window, and the dossier needs updating.

**CRM, minimum lovable:** one `Lead` model unifying DreamDesign +
IntakeSubmission + manual entry; a **fixed** 6-stage kanban (Lead → Site
visit → Designing → Proposal sent → Signed → In build) where the last
three stages **derive from Project state that already exists**
(`sharedAt`, proposal acceptance, `CONSTRUCTION_READY`); a next-follow-up
date with an overdue inbox (follow-up speed is what moves conversion at
6-50 permits/mo, ~40% lift for multi-channel follow-up per
[pitchit.ai](https://www.pitchit.ai/pool-builders/pool-builder-lead-statistics));
a source enum. Skip: email sequences, deal values (money lives on the
Quote), custom stages, company CRM.

**Scheduling is two different objects.** For jobs at 10-40 concurrent
builds, not a per-project Gantt but a **stacked stage-bar board**: one row
per active project, colored bars per construction stage, inspection dates
as pins, crew/sub as assignee. Within one pool the stages are essentially
linear, so critical-path math is over-engineering; the real question the
board answers is "which pools collide on the gunite crew this week".
Weather slack = drag a bar; don't model weather. Staff get an ordinary
week/day appointment calendar linked to leads/projects. Both feed off the
same stage machinery as Track 3.

**Routes = the superintendent's day plan, nothing more.** 6-10 stops:
manual drag-to-order plus one Google Maps deep link (waypoints URL).
Auto-ordering later via Routes API `optimizeWaypointOrder` lands inside
Google's free monthly cap at one-superintendent volume, effectively $0.
Fleet VRP tools (Route Optimization API, Mapbox) are maintenance-company
tools; skip. First slice: a "Today" screen of builds filtered by
stage-needs-attention.

**Roles:** expand the 3-value `OrgRole` to OWNER / ADMIN / SALES_DESIGNER
/ SUPERINTENDENT / CREW_LEAD, plus a **sub "portal" as tokenized links**
(the IntakeLink pattern, not a seat: assigned stage dates + address +
plans only). Poologics' 20-user cap makes per-seat generosity a wedge.

### Track 7 · Change orders and margin (from the repo, not research)

Two of the raised ideas need no external research because the machinery
half-exists:

- **Change orders.** The scope moves after signing, always. Pool Forge
  already has versioned quotes ("a sent proposal keeps the prices it was
  sent with") and a reviewed-price-change model (`PriceChangeRequest`).
  A change order is the same discipline applied to one job after
  acceptance: a delta against the accepted quote version (add spa
  spillover, +$4,850), customer-approved through the same share-link
  acceptance flow the proposal used, folded into the draw schedule as an
  amended or added draw. Needs its own short design pass; the primitives
  exist. This also pairs with Track 2: a change order frequently *is* a
  sub's extra ("rock clause" on excavation).
- **Margin/markup.** `costAndRetail` is already held separately; margin
  is a computed column and a per-line markup control away. Small,
  high-value, and a prerequisite for job costing ever meaning anything.
  The diff lists margin as a gap nobody in the survey verifiably has
  either: cheap uncontested ground.

## Sequencing

The dependency root is unambiguous: **five of seven tracks feed on the
project stage graph** (workflow triggers, draw invoices, sub POs and
waiver gates, the scheduling board, the field app's "today's jobs", the
CRM's derived stages). So the plan is wave-shaped, per the standing
parallel-plan discipline:

**Wave 0, the contract (one track, small):** the stage-graph data model
from Track 3 (`WorkflowTemplate`/`StageNode`/`StageEdge`/`StageTrigger`/
`ProjectStageInstance`), the `source: 'workflow'` command source, pg-boss,
and the roles expansion. No UI beyond a seeded default pool-build
template. Everything else builds against this contract.

**Wave 1, parallel fan-out (five independent tracks):**

- **A · Workflow engine + list editor** (Track 3): the reducer, trigger
  dispatch through the registry, drag-ordered template editor v1.
- **B · Money** (Track 5): Stripe Connect Standard + Invoicing, draw
  schedule → invoice-per-milestone, webhooks into a project ledger.
  Its `invoice.releaseDraw` command becomes a workflow trigger the day
  both land.
- **C · Subs** (Track 2): directory + COI expiry, RFQ generalization,
  POs, the waiver-gated `payment.release`, F.S. 713.20 PDF kinds.
- **D · CRM slice** (Track 6): Lead unification + kanban + follow-up
  inbox.
- **E · Render service** (Track 4): glTF → headless Cycles worker.
  Fully independent of everything else; also the most demoable.

**Wave 2, integration consumers:** the field app (Capacitor; reads
stages, jobs, punch lists, clock-in), the stage-board job calendar +
staff calendar, the routes Today screen, change orders (quote delta +
draw amendment), the Decision Log, financing referral links on the
proposal (days), the React Flow canvas as a view swap over the Wave 0
model, "dream mode" AI enhancement over the render service.

**Deliberately not built:** a Gantt/CPM scheduling engine, retainage/AIA
pay apps, maintenance-fleet route optimization, silent call recording
(felony in Florida), Affirm, Stripe Billing, OR-joins in the workflow
graph, native Temporal-style durable execution.

Open questions for the owner: which Wave 1 track goes first if they
cannot all run at once; whether the sub portal (tokenized links) is Wave
2 or later; whether photoreal pricing is metered per render (Cedreo
model) or flat.

