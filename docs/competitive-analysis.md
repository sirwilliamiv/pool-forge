# Pool Forge — Competitive Dossier: "Pool Design in the Browser"

Research date: 2026-07-24. Method: live product inspection where accessible (Cedreo planner driven directly; network + UI observed) plus deep web research for paywalled/desktop products. Every competitor is scored against the same framework so profiles are comparable. Unknowns are marked, never fabricated.

---

## Re-verification log

**Pass 2 · 2026-08-28.** Baseline capture date for this document remains **2026-07-24**. Anything below not explicitly stamped `verified 2026-08-28` was **not** re-checked in this pass and should be read as "as recorded 2026-07-24".

**Added this pass:** JobTread (§4.7) and Pool Brain (§4.8) in Track 4, plus a new **Market context** section (Florida permit data) that is customer research, not a competitor profile. Both new entries are in the scorecard.

**Re-checked against vendor pages loaded 2026-08-28:** Structure Studios (Pool Studio, Vip3D, VizTerra, YARD), ProDBX, Poologics. Figures that moved are shown inline as `was → now` so the change stays visible; nothing was silently overwritten.

| Figure | 2026-07-24 | 2026-08-28 | Status |
|---|---|---|---|
| Pool Studio | $147/mo · $125/mo annual · $95 setup | identical | **Confirmed unchanged** |
| Vip3D | $197/mo · $167/mo annual | identical | **Confirmed unchanged** |
| Vip3D intro promo | ~$127/mo first 3 months | gone; site now states it does not offer promotions or special pricing | **Withdrawn** |
| VizTerra | $97/mo · $84/mo annual | identical | **Confirmed unchanged** |
| YARD | $30/mo add-on | $30/mo confirmed; **$25/user/mo annual** newly published (in `llms.txt` only, not on the human pricing page) | **Confirmed + new detail** |
| Structure Studios system reqs | Win 11 · i7 · 16GB · RTX 4060+ · 50GB | identical on the requirements page; a stricter hardware-guidance page dated 08.24.2026 now warns off any card "ending in 50" (RTX 3050/4050/5050) and a `llms.txt` spec adds PassMark 4500 min / 32GB recommended | **Confirmed, floor effectively rising** |
| ProDBX | $0 / $19 / $79 / $119 per user/mo (GetApp-sourced) | vendor now self-publishes: list **$19 / $59 / $99 / $139** per user/mo, with a 6-month intro column at $0 / $39 / $79 / $119, and **seat minimums of 5 / 5 / 10** | **Moved.** Old figures were the promo column mirrored by a stale GetApp listing |
| ProDBX QuickBooks | "notably no QuickBooks" | **Wrong now.** A one-way ProDBX→QBO sync exists | **Corrected** |
| Poologics | $249/mo annual · $279 quarterly · $299 month-to-month | **$279/mo annual ($3,348/yr) · $329/mo monthly**; quarterly tier removed; new **20-user cap** | **Moved: up ~12% annual, ~10% monthly** |

**Not re-checked in this pass** (still 2026-07-24 figures): Cedreo, Realtime Landscaping, Uvision, PRO-SUITE, PoolDraw, D5, Lumion, Twinmotion, MyPoolDesigner.ai, Latham, PoolDes, Hearth, Houzz Pro, QuoteIQ, Jobber. Two of those carry a known risk of drift: Hearth and Houzz Pro were demo-gated / volume-quoted at capture, so their ranges were never firm.

**Two dossier links are now dead** and are corrected in Track 1: `structurestudios.com/pricing` 404s (canonical is `/landscape-design-software-and-pool-design-software-pricing-compare`), and the Vip3D product page moved to `/vip3d-3d-outdoor-living-design-software` with a hard 404 and no redirect on the old slug.


## The evaluation framework (applies to every profile)

- **A · Snapshot** — product + vendor, positioning, primary user, maturity/market signal
- **B · Platform & access** — desktop/web/mobile; install required; OS lock; **runs in a mobile browser?**; what device the customer views on
- **C · Design & modeling** — 2D/3D; pool-specific tools (freeform pools, spa, decks, coping, water features, screen enclosures); parametric objects; asset library; survey/CAD import; learning curve
- **D · Rendering** (weighted heaviest) — real-time vs offline/server; tech; **where it computes (client vs server)**; photorealism 1–5; output formats; speed + camera control
- **E · Estimating & docs** — priced quote? price book/formulas/takeoffs/tax? construction/permit/site-plan docs?
- **F · Customer presentation & sharing** — what the customer receives; **customer control: passive viewer vs interactive (spin, options, live price, accept)**; shareable no-login link; e-sign; financing
- **G · AI / automation**
- **H · Business model** — subscription vs perpetual, tiers, $ points, per-seat, trial
- **I · Integrations** — CRM / QuickBooks / financing / asset partners
- **J · Verdict for Pool Forge** — bar to match · gap to exploit · one-line "how we win"

Scorecard axes (matrix at the end): Browser-native · Mobile-viable · Photoreal · Customer-interactivity · Estimating-integrated · ~Price.

---

# TRACK 1 — Structure Studios (the incumbent to beat)

Vendor: Structure Studios (Henderson, NV), founded 1999 by Noah Nehlich, family-owned, ~25 years old. Claims "96% of top designers" / "2M+ projects/year." Dominant, entrenched — a closed-ecosystem Windows-desktop incumbent to out-architect, not out-fund. ([About](https://www.structurestudios.com/About), [Tracxn](https://tracxn.com/d/companies/structurestudios/__1gHA6EY0aRbW7MQ4yUY68w9WC_JeTs6A7pLVJr9mNrI))

**Cross-suite fact #1 (the big one):** the entire pro suite (Pool Studio, Vip3D, VizTerra) is a **Windows-only native desktop install requiring a discrete NVIDIA RTX GPU** (V4 recommends Win 11 + i7 + 16GB + **RTX 4060+** + 50GB). **No web app, no mobile browser, anywhere.** YARD (their only mobile product) is a native iPad-Pro-with-LiDAR app. Note: Capterra/GetApp list "Web, Android, iPhone" — that is **inaccurate auto-tagged metadata**; the vendor's own [system-requirements page](https://www.structurestudios.com/vip3d-vizterra-pool-studio-system-requirements) is authoritative.

**Cross-suite fact #1, re-verified 2026-08-28 and now stated more bluntly by the vendor than we had it.** The requirements page still publishes exactly what we recorded (Version 4 minimum-recommended: Windows 11, Intel Core i7 10th gen+, 16GB+, "Nvidia GeForce RTX 4060 (or greater)", 50GB). Three things are new and all of them harden the platform lockout:

- **Mac is now explicitly and permanently ruled out**, not "contact us." [Hardware recommendations](https://www.structurestudios.com/help/computer-hardware-recommendations) (page stamped "as of 08.24.2026"): *"Will the software run on macOS? No, the software cannot be installed on macOS or OS X. **We have no plans to add native support.**"* Parallels 15 "is not suggested", "VMWare Fusion will not work", and [llms.txt](https://www.structurestudios.com/llms.txt) adds that Apple Silicon Macs "cannot run the software" at all since Boot Camp is gone. The Boot Camp escape hatch only ever existed for Intel Macs, which are now end-of-life hardware. **The Mac door is closed, permanently, by the vendor's own statement.**
- **The real hardware floor is higher than the published minimum.** The same hardware page warns: *"Video cards with model numbers ending in '50' are underpowered for demanding tasks. Avoid models such as the RTX 3050, 4050, and 5050."* Its recommended machines run RTX 5060 to 5080 at **$1,099 to $3,519**, with a "Best Possible" tier at RTX 5090 / 64-128GB RAM. `llms.txt` adds a benchmark floor ("PassMark score 4500 minimum", 32GB RAM recommended) and states *"Integrated graphics (such as Intel integrated GPUs) are not supported."* VR (Vip3D only) needs "RTX 4070 or greater" plus a Meta Quest 3.
- **Still no web app, no browser version, no cloud version** anywhere on any page loaded 2026-08-28.

**URL corrections:** the old `/pricing` path now 404s; canonical pricing is [/landscape-design-software-and-pool-design-software-pricing-compare](https://www.structurestudios.com/landscape-design-software-and-pool-design-software-pricing-compare). The Vip3D product page moved to [/vip3d-3d-outdoor-living-design-software](https://www.structurestudios.com/vip3d-3d-outdoor-living-design-software) (hard 404, no redirect, on the old "pool-and-landscape" slug). The slug change from "pool and landscape" to "outdoor living" is worth noting on its own: their flagship is drifting away from the word "pool".

## 1.1 Pool Studio ($147/mo, or $125/mo annual, + $95 setup) · **all three figures verified unchanged 2026-08-28**

- **A:** Mid-tier, pool-focused CAD + real-time 3D for pro pool builders/designers. ([product page](https://www.structurestudios.com/pool-studio-3d-swimming-pool-design-software))
- **B:** Windows desktop install; Mac = **now "no plans to add native support"** (was "contact us", see cross-suite note above). **Mobile browser: no.** Customer views on the designer's screen, exported media, or YARD iPad.
- **C:** 2D+3D one file, one-click switch. Freeform AND geometric pools, spas/raised spas, tanning ledges, step entries, water features, spillovers/scuppers, coping, decks, pergolas, fiberglass shells. **Parametric smart objects.** Library: **2,924 objects / 1,503 HD materials / 1,748 plants** (pre-V4). Import: AutoCAD DWG, GIS/aerial + parcel/setbacks, topo lines, scanned sitemaps. 3D praised as easy; 2D weaker than true CAD.
- **D:** Real-time on **local NVIDIA GPU (client-side)** — V4 path tracing + DLSS + dynamic GI. Photorealism **~4/5** (HDRI/4K-video/VR gated to Vip3D). Stills to 8K; video storyboard. Manual camera.
- **E:** Strong construction docs (triangulation, sqft/lf, material takeoffs, "Smart Data" like nozzle counts and raised-pool concrete). **No priced estimating, no price book, no tax, no quotes/proposals.**
- **F:** Customer = **passive viewer** of designer-led walkthroughs/exports. **No shareable link, no options-toggling, no live price, no e-sign, no financing.**
- **G:** **No AI.**
- **H:** Subscription per-seat, cancel anytime; 30-day trial, no card. **Verified 2026-08-28**, vendor FAQ verbatim: *"Pool Studio costs $147 per month, or $125 per month when billed annually"*; *"Subscriptions start with a one-time setup fee of $95"*; *"You can try the software free for 30 days with full access to all features — no credit card required to start."*
- **I:** Closed ecosystem. Import-only (DWG/GIS). No CRM/QB/financing.
- **J:** **Match:** parametric pool objects + trusted GPU realism. **Exploit:** Windows/RTX lockout + zero pricing + zero shareable link. **Win:** "any device, design a pool, send a live interactive priced link with one-click accept."

## 1.2 Vip3D ($197/mo, or $167/mo annual) · **verified 2026-08-28; the intro promo is gone**

- **A:** Premium tier: Pool Studio + full landscape/hardscape + top-end viz + advanced docs. "Most Popular."
- **H (moved):** `promo ~$127/mo first 3 months` **→ withdrawn.** The base figures are confirmed verbatim (*"Vip3D... is $197 per month, or $167 per month billed annually"*), but no promo language survives anywhere on the site, and the pricing page now carries an explicit statement that **"We do not offer promotions or special pricing."** Read that as a deliberate no-discount posture, which matters if we ever expect them to price-fight a browser challenger: they have publicly taken discounting off the table.
- **B:** Same Windows/RTX constraints. **Mobile browser: no.**
- **C:** Adds full landscape (planting plans), hardscape, wood decks, outdoor kitchens, fire features, grading/drafting; **SketchUp + FBX import** on top of DWG/GIS; largest library (2,930 objects pre-V4); cross-sections, scaled plans.
- **D (their moat):** V4 path tracing on local RTX. Marketing explicitly: "reflections move, shadows shift, light refracts in translucent water and glass," **pool water caustics**, **HDRI skies** (import your own). **~4.5/5 photorealism.** Output: 8K stills, 4K video, **one-click 360°/VR**, storyboard queue, AR via YARD. Manual camera.
- **E:** Best docs in suite — **Automatic Spec Sheets**, Instant Calculations, permit-ready plans, expanded GIS (auto parcel lines/setbacks/assessor data). **Still zero dollars: no quotes, no price book, no tax.**
- **F:** Stills/4K video/VR-360 + in-person iPad AR. **No shareable no-login link, no self-serve viewer, no e-sign, no financing.** Passive viewer.
- **G:** **No AI.**
- **J:** **Match:** water-accurate path-traced renders + VR that close premium jobs. **Exploit:** heavy designer-only install; homeowner never gets an interactive priced proposal on their phone. **Win:** "good-enough" browser water realism + decisively better last mile (share link + live price + e-sign + financing).

## 1.3 VizTerra ($97/mo, or $84/mo annual) — landscape tier

- **A:** Entry tier — landscape/hardscape/decks, **no pools** (that's the upsell to Pool Studio).
- **B:** Same Windows/RTX. Reviews flag it resource-heavy.
- **C:** 2D→3D one click; hardscape, kitchens, wood decks, terrain/grading, retaining walls; strong plant library; **recurring reviewer complaint: 2D side is "cumbersome," not CAD-standard.**
- **D:** Same V4 engine, tier-capped (**no VR/360, video QHD only**). ~4/5.
- **E/F/G:** Quantities-on-plans only; passive-viewer delivery; no AI. Pricing verified unchanged 2026-08-28 ($97/mo, $84/mo annual).
- **E, new and the most strategically useful thing found this pass:** Structure Studios has since launched a dedicated [landscape estimating software](https://www.structurestudios.com/vizterra-best-landscape-estimating-software) page, headlined "Landscape Estimating Software That Wins the Bid". **They ship an estimating marketing page and then explicitly refuse to price anything**, verbatim: *"VizTerra doesn't build the quote for you. Smart Data hands you the exact quantities, and you apply the pricing, labor rates, and margin your business runs on."* And in the FAQ: *"Does VizTerra price my takeoffs or build client quotes? **No.** Smart Data gives you the accurate quantities, and you apply your own pricing, labor rates, and margin. **That is by design.**"* This is the incumbent stating on the record that the priced-quote gap is a **product decision, not a backlog item**. It is the single best piece of evidence in this dossier that the design-to-dollars loop is not about to be closed by the market leader, and it is quotable on a public comparison page because it is their own words.
- **J:** For the landscape adjacency: browser + solid 2D drafting + instant priced proposals undercuts their weak 2D and install barrier.

## 1.4 YARD ($30/mo add-on, or $25/user/mo annual) — AR app · **verified 2026-08-28**

- **A:** AR companion that drops finished desktop designs into the real backyard on-site. Pro-facing, not homeowner self-serve.
- **B:** **Native iOS, iPad Pro with LiDAR required.** No Android, no web. Requires a paid desktop seat, confirmed verbatim 2026-08-28: *"YARD is available as an add-on companion app for active Pool Studio, VizTerra, and Vip3D members. It is not available as a standalone product."* New detail: an annual rate of **$25/user/mo** is published, but only in [llms.txt](https://www.structurestudios.com/llms.txt), not on the human-facing pricing page. A vendor publishing a price to machine readers that it does not show buyers is a small tell about where their attention is.
- **C/D:** Imports suite projects; on-site AR sketching; LiDAR-anchored 1:1 placement; ~3.5/5 mobile-AR fidelity. The one place the customer controls the camera (walking the iPad around).
- **F:** **In-person only, tethered to the pro's iPad.** No remote link, no take-home, no pricing/accept.
- **J:** **Exploit with WebXR/WebAR in the mobile browser** — the homeowner's own phone, via a share link, no $30 app, no iPad Pro. Turns AR from a supervised demo into a remote self-serve proposal.

## 1.5 Version 4 engine (launched April 7, 2026 — the render bar)

- **Tech:** path tracing + **NVIDIA DLSS** + fully dynamic global illumination — a native-GPU, game-engine-class real-time path tracer. **Computes on the client's local RTX GPU; no cloud farm anywhere.** Real-time preview; final photo/video renders queued/batched.
- **Fidelity ~4.5/5:** PBR materials, HDRI skies, **pool water caustics** + 12 water-feature options, day→dusk→night sun/moon, deep vegetation. Stills 8K, video 4K, one-click 360/VR (Vip3D).
- **V4 also added:** ~1,000 new assets (+456 plants, +148 materials, dynamic doors/rockwork), cross-section tool, scaled 3D plan views, bigger GIS, 2,550×2,550 ft grid.
- **V4 did NOT add:** any AI (DLSS aside), any pricing/proposal tooling, any web/share capability. Hardware floor went **up** (RTX 4060+). **Re-checked 2026-08-28: still no AI feature anywhere in the product.** The only "AI" strings on the whole site are `AI.txt` and an "LLM Info Page" footer link, which are crawler-facing documents about the company, not product capabilities.
- Sources: [Pool Magazine](https://www.poolmagazine.com/news/press-releases/structure-studios-launches-version-4-of-its-professional-pool-and-landscape-design-software-suite/), [V4 blog](https://www.structurestudios.com/blog/new-version4-vip3d-poolstudio-vizterra-update), [Green Industry Pros](https://www.greenindustrypros.com/design-installation/design/product/22964970/structure-studios-structure-studios-launches-v4-design-software-suite).

## Track 1 synthesis

| Dimension | Structure Studios | Pool Forge opening |
|---|---|---|
| Platform | Windows-only install; **RTX 4060+ required** (vendor now warns off anything ending in "50", so effectively RTX 5060+); no browser/mobile (YARD = iPad-Pro-only); **Mac ruled out permanently** | Browser on any device, no install |
| Rendering | Best-in-class local-GPU path tracing (the bar) | Aim "great," not "equal"; server render + WebGL preview |
| Estimating | Takeoffs/quantities only, **no dollars anywhere**, and now confirmed as a deliberate refusal: *"That is by design"* | Priced estimating + proposals = wide open |
| Customer delivery | Designer-led exports/VR/in-person AR; **no link/e-sign/financing/live price** | Shareable no-login interactive link + price + accept + financing |
| AI | **None** (re-checked 2026-08-28) | Photo→design, AI estimating, auto-camera all uncontested |
| Integrations | Closed | Open (QB, CRM, Hearth) |
| Reputation | Entrenched, but G2 ~1.9 with **aggressive per-seat license enforcement** + "combative" support complaints | Friendly licensing + self-serve onboarding wedge |

**Marked unknowns:** active-user count; whether aggregator-listed "API access" is real (no public API documented); V4 exact render times; any undocumented share link (none found — appears absent).

---

# TRACK 2 — Web/value pool tools (Cedreo, Realtime Landscaping, Uvision, Pool Templates, PoolDraw)

Method note: Cedreo was ALSO inspected live (planner driven directly in-browser this session); PoolDraw's own site refused all connections during research — a status signal in itself.

## 2.1 Cedreo — the architecture to emulate (cedreo.com/backyard-planner)

- **A:** Cedreo SAS (France, ~2005/product ~2012, bootstrapped, est. ~$10.5M ARR). Cloud 3D home + exterior design + photoreal rendering for pros with "ZERO CAD experience." ~4,000–5,000 customers; Capterra 4.4/5 (46 reviews). Backyard/pool is a secondary use-case on a home-design core.
- **B:** 100% web-based, no install. Windows/macOS + Chrome/Safari/Firefox/Edge. **Mobile browser: NO for design** — official reqs are desktop-only and state "You will need a mouse to draw and navigate effectively." Customer views a delivered image/PDF, not the live app.
- **C (live-verified):** 2D plan canvas + live 3D pane; modules Layout (Land/Walls/Posts/Rooms/Levels/Transformations), Wall Openings, Roof, Exterior, Furnishings, Materials, Studio, Plan details, Folder; trace-image import JPEG/PNG/PDF/DWG/DXF. Pool tools are **generic** (pools/patios/decks/fences) — no freeform-pool parametrics, no coping/tile takeoff, no water features, no screen enclosures. Low learning curve.
- **D (KEY FINDING — VERIFIED SERVER-SIDE):** offline **cloud render farm**, not client WebGL. Their own docs: *"The photorealistic rendering is created in the cloud so your computer stays available"* · *"cloud-powered rendering engine"* · *"powerful servers built specifically for fast 3D rendering… 5 minutes or less"* · *"without the need for expensive graphics cards"* ([cedreo.com/3d-rendering](https://cedreo.com/3d-rendering/)). "Studio / Quality on autopilot" (auto camera + lighting) = server pipeline; renders are **credit-metered/paywalled** (observed live: Subscribe upsell). Photorealism ~4/5 (good materials/lighting/vegetation; water is not pool-grade). Output: **photoreal stills only** — no video/360/VR/AR.
- **E:** **None.** No quotes, price book, takeoffs, or tax. Docs = 2D plans + presentation PDFs.
- **F:** Customer receives **static images + PDFs (passive viewer)**. No interactive link, no live pricing, no e-sign, no financing.
- **G:** Render automation (auto camera/lighting) — automation, not generative AI.
- **H:** Free $0 (1 project, 5 renders, watermark) · Personal $139 one-time (20 renders/project, watermark) · Professional **$129/mo** (1 user, 40 renders/mo) · Enterprise **$159/user/mo** (80 renders/user/mo). Render credits don't roll over.
- **I:** Essentially none (import-only DWG/DXF trace).
- **J:** **Match:** the no-install browser editor + cloud-render-farm + auto-camera UX — this is the architecture blueprint. **Exploit:** home-first not pool-first; zero estimating; desktop-only (mouse required); credit-gated renders. **Win:** "Cedreo's cloud-render UX, purpose-built for pools, with a real priced quote and a mobile-friendly interactive client link."

## 2.2 Realtime Landscaping (Idea Spectrum) — deepest pool modeling at budget price

- **A:** Long-running Windows desktop landscape+pool design for homeowners AND pros.
- **B:** **Windows 10/11 desktop only. No browser, no Mac, no mobile.**
- **C (their moat):** genuinely pool-specialized — freeform below/above-ground pools any shape, spas, custom stairs/seats, **infinity edges with flowing water**, animated steam/bubbles, **400+ pool accessories incl. S.R. Smith**, pool lighting, design-over-a-photo, terrain grading. Architect tier adds construction plans + CAD elevation import.
- **D:** real-time DirectX on local GPU ("Realtime Walkthrough" with flowing water, koi, night lighting). **~3/5 photoreal** — 2026 comparison: "visuals won't hold up against more advanced competition." Output: walkthrough video (YouTube), **interactive 3D panoramas to 8192×8192** (view-only pan), prints.
- **E:** light — "Project Material List" with manual prices → Excel export; Architect adds construction drawings. No proposal/tax engine.
- **F:** video + view-only panorama + prints. No options/price/e-sign/financing.
- **H:** **Perpetual one-time**: Pro **$279**, Architect **$599** (Plus tier base unknown). Free limited trial.
- **J:** **Match:** its pool-object depth (freeform, infinity edges, accessory library) in the browser. **Exploit:** dated real-time look, Windows install, thin estimating, no share/e-sign. 

## 2.3 Uvision 3D (Idea Spectrum engine, Unilock-branded) — the distribution lesson

- **A:** Same engine private-labeled for **Unilock** (paver manufacturer) as a contractor sales tool. Users = Unilock authorized contractors.
- **B:** Windows desktop only (DirectX 11). No browser.
- **C/D:** Idea Spectrum core + **200+ Unilock colors/textures + pre-drawn Unilock elements**; catalog **locked to Unilock products**. Real-time local GPU, ~3/5; fly-through videos.
- **E:** Unilock-catalog-oriented "Design and Estimating Tools"; depth unknown.
- **H:** 30-day trial; **effectively free/subsidized for Unilock contractors** — the manufacturer pays to drive paver sales. Standalone price unknown.
- **J (the real takeaway):** **manufacturers will fund the design tool for their dealers.** A white-label browser pool designer sponsored by pool-equipment/finish brands (S.R. Smith, Pentair, tile/coping makers) is a distribution wedge nobody in pool exploits today.

## 2.4 Pool Templates PRO-SUITE — deepest pool estimating, worst architecture

- **A:** E.S.I. Corp's Windows add-in that turns **MS Office + Realtime Landscaping Architect** into a pool design+estimating+proposal suite. "No monthly fees" positioning; small/niche with loyal builder testimonials.
- **B:** Windows only; explicitly "No Internet needed (not 'Cloud' based)"; requires Office 2010+/365 AND RLA. **No browser.**
- **C:** hundreds of pool-industry CAD shapes; fiberglass/vinyl/custom; **plumbing & electrical layers**; imports surveys/plot plans/satellite; **auto-calculates area, perimeter, IA, cu.ft., gallons, deck area, coping, and tile** — strongest pool-takeoff automation in this track.
- **D:** rides the RLA engine (local real-time, ~3/5); markets 8K stills/4K movies/360-VR (Oculus).
- **E (strongest here):** **ESI Pool Estimator Pro for Excel** — pricing database, customized estimates, **proposals + contracts**, **Gantt job scheduler**; scaled PDF plans to 34"×44" with plumbing/electrical. A real design→estimate→proposal→schedule chain.
- **F:** scaled PDF + movie + 360/VR + printed contract (passive). No link/e-sign/financing.
- **H:** **$495 one-time** + RLA (~$599) + Office — ~$1,100+ all-in, no subscription. Proves builders pay one-time to dodge SaaS.
- **J:** **Match:** its takeoff-to-contract depth (gallons/coping/tile → pricing DB → contract → schedule) as ONE cohesive browser app. **Exploit:** brittle 3-product Frankenstack, offline, install-heavy.

## 2.5 PoolDraw — the legacy to leapfrog

- **A:** Clearwater FL, in pool tech since ~1993–95. Visio add-in CAD (Pooldraw 2010/3D, PoolOffice, PoolQuote back-office). **pooldraw.com refused all connections during research** — treat as dormant/near-EOL.
- **B:** Windows + **requires Microsoft Visio** (itself now subscription). No browser.
- **C/D:** drag-drop Visio pool drawing, colored 1D designs, static "artistic" 3D renders (~2/5), construction plans, prefab waterfalls/rocks.
- **E:** real (dated) chain — construction plans + detailed estimates via PoolQuote/PoolOffice.
- **H:** perpetual; dated ~2008 pricing: ~$1,249/user + $699/computer for 3D. Current price unknown.
- **J:** decades of builder trust in construction-docs+estimates, welded to a dead-end stack. **Win:** "everything PoolDraw builders rely on, reborn in the browser, killing the Visio dependency."

## Track 2 synthesis

- **Only Cedreo is browser-native — and it verifies the cloud-render-farm thesis** (server-side, ~5-min photoreal stills, no client GPU) while leaving **pool specialization, estimating, and mobile all unserved** (mouse required!). The triangle *browser + pool-specialized + priced proposal + mobile-viewable* is **unoccupied**.
- The other four are Windows-desktop perpetual-license local-GPU tools (the **Idea Spectrum engine powers 3 of them**). None has a shareable interactive link, e-sign, or financing.
- Best-of-breed today is split three ways: **modeling** = Realtime Landscaping · **estimating** = PRO-SUITE · **render architecture** = Cedreo. **No competitor combines them.** Pool Forge's plan is exactly that combination.
- **Distribution wedge from Uvision:** manufacturer-funded white-label for dealers.
- **Unknowns:** Cedreo exact mobile-viewing capability; Uvision non-Unilock price; PoolDraw operational status.

---

# TRACK 3 — Render engines + AI/AR/outsourced (D5, Lumion, Twinmotion/Cloud, MyPoolDesigner.ai, Latham AR, PoolDes)

Hard constraint applied throughout: the customer views in a MOBILE BROWSER.

## Mobile-browser punchline table

| Product | Author in browser? | Customer views in mobile browser? | What the customer gets | Embeddable by us? |
|---|---|---|---|---|
| D5 Render | No (Win desktop) | Yes — baked tours via Showreel link/QR | Pre-baked 360/spatial tour, comments | No (no API) |
| Lumion | No (Win desktop) | Yes — 360 panos via Lumion Cloud link/QR | Look-around cubemap panoramas | No (no API) |
| Twinmotion Cloud | No (Win/Mac desktop) | **Yes — best in class**: pixel-streamed interactive scene | Live navigable 3D (session-capped) or 360 tour | No (closed; the pattern to study) |
| MyPoolDesigner.ai | **Yes (pure web)** | Yes — but static AI images/video | Photoreal-looking concepts, no geometry | Replicate the approach |
| Latham AR | n/a | **No** — native iOS/Android app only | AR placement; screenshot share | No; learn from it |
| PoolDes.com | n/a (email-in service) | n/a — .zip of JPG/MP4/2D drawings | Stills, day/night video, engineer-ready drawings | Possible white-label drafting backend |

## 3.1 D5 Render — the photorealism bar (5/5)

- Dimension 5 (Nanjing, ~$96M raised, ~$80M Series C Jan 2025; claims 3M+ users). **Windows-only desktop**, DX12/DXR real-time path tracing on the **local GPU** (GTX 1060+, not RTX-locked). Not a modeler — imports geometry, dresses scenes; 16,000+ assets (D5 Works).
- Output: stills to 16K, video to 4K/8K, 360 panos, **D5 Showreel** interactive tours (panoramas + Gaussian-splat dollhouse) opened via link/QR on any phone — password/expiry/analytics. Interactive within baked bounds; no live reconfiguration.
- Heavy AI: text-to-3D, image-to-3D, AI PBR textures, AI Agent (NL scene edits).
- Pricing: Community free (1 publishable tour) · Pro reported **$38/mo or $360/yr** (consistent with official "Save 21%") · Teams per-seat. **No public API, no headless render, no embeddable SDK.**
- **Verdict:** cannot integrate; treat as the quality bar. Validates link/QR baked-tour delivery. Beat it with live configurable in-browser rendering it structurally can't do.

## 3.2 Lumion — the sharing pattern to copy

- Lumion (NL). Desktop, **Windows-only** for Pro/Studio ($229/yr View · **$1,149/yr Pro** · $1,499/yr Studio; annual upfront; RT-capable GPU + 12GB VRAM). Real-time + path-traced hybrid, ~4/5. 10,000+ assets; imports incl. **glTF/glb**.
- Delivery (verified at network level): 360 panoramas served as **6 static cubemap JPEGs into a lightweight WebGL viewer** — inherently mobile, trivially replicable. Legacy My Lumion portal **dies December 2026**; Lumion Cloud (Beta, free, 20 projects/50GB) is the successor: no-login link/QR to stills, video, PDFs, and multi-point 360 tours (up to 300 panos/project, "Street View for your designs").
- AI: cloud upscaler (16K), AI PBR materials from photos. **No API/SDK.**
- **Verdict:** don't embed — **copy the cubemap-pano delivery trick** (CDN JPEGs + WebGL viewer ≈ zero cost) and beat it on live in-browser design + instant estimate.

## 3.3 Twinmotion + Twinmotion Cloud — the end-customer experience, proven

- Epic Games, Unreal-based. Desktop authoring **Windows AND macOS** (only Group-1 engine with Mac authoring; Path Tracer/VR/Lumen are Windows-only). Real-time ~4/5, path-traced stills ~4.5/5.
- **Twinmotion Cloud computes on Epic's cloud GPUs** — *Presentations* are **pixel-streamed**: the customer's phone browser receives a live interactive scene via link/QR/HTML-embed (Chrome/Safari/Firefox/Edge, iOS/Android). Epic-documented constraints: 4GB max upload, 2K texture cap, ~25 Mbps recommended, **60-min max session** + 30-min idle disconnect, GPU queueing at ~100 concurrent. *Panorama Sets* (up to 100 pre-rendered 360s) have no session limits.
- **Pricing correction (important):** free full app for <$1M-revenue companies, **BUT Twinmotion Cloud is excluded from the free tier** — Cloud requires **$445/seat/yr** ($1,850/yr for the Unreal bundle). Earlier assumption that the shareable-link product was free under $1M is wrong.
- **No public developer API** for programmatic upload/render.
- **Verdict:** the existing proof that "interactive photoreal scene on a phone browser via a link" works commercially — and its weaknesses write our spec: session caps, bandwidth floors, GPU queues, per-seat gate, zero estimating. **Win by rendering client-side WebGL in the customer's browser (no sessions, no queues) + attaching the priced proposal.**

## 3.4 MyPoolDesigner.ai — mobile-browser sizzle, zero substance

- PoolMarketing.com (pool-industry agency), launched **April 2026**. **Pure browser React SPA — the only competitor that authors in a mobile browser.**
- **Image-only:** a 6-step preset picker (9 pool shapes, 21 home styles, time of day, max 4 premium features) + custom prompt (Premium) + backyard-photo **AI inpainting** + image-to-video. In-app warning: "Some selected features may not appear in final designs." **No CAD, no dimensions, no editable geometry, no 3D model** (Capterra's "2D drawing tools" claim contradicted by direct inspection).
- Pipeline is **commodity**: user-selectable third-party model APIs — Replicate (SeeDream-3 default, Flux, Ideogram, Recraft, Qwen) and Leonardo (Motion 2.0 video). 30s–4min per batch. 4.5/5 surface realism, **zero dimensional fidelity**.
- Pricing: Pro **$29.99/mo** (100 img) · Premium **$89.99/mo** (500 img, multi-viewpoint, custom prompts, thin "API access"). WordPress display plugin.
- **Verdict:** competitor only at the "wow-the-homeowner concept" layer AND a feature blueprint — replicate the photo→inpainted-concept funnel in days, then win with real geometry + estimate + interactive proposal it structurally cannot produce.

## 3.5 Latham AR Pool Visualizer — the proven hook, trapped in a dead app

- Latham Group (NASDAQ: SWIM), largest US inground-pool manufacturer. Native iOS/Android AR app (launched 2019): place ~15 fiberglass shells, 12 colors, true-scale in the real yard; "Mini AR" tabletop; screenshot share; routes to Find-a-Dealer.
- **Stale: last iOS update July 2022, rated 1.6/5.** No WebXR/browser version. Latham's separate web Cost Estimator is literally desktop-only ("mobile view coming soon"). Free (pure dealer lead-gen).
- **Verdict:** proves the "pool in YOUR yard" hook — then stranded it. Every gap is our wedge: WebAR from a text link, custom geometry, integrated live estimate, shareable proposal.

## 3.6 PoolDes.com — the manual workflow we automate

- South Florida shop (two pool builders; orders via gmail). Email a sketch + survey → they deliver in **1–3 business days**: multi-angle stills, day+night walkthrough video, and **engineer-ready 2D drawings** — built in-house on **Pool Studio + AutoCAD**. ~3/5 realism (Pool Studio-class).
- Pricing: ready-made packages $99–199.99 (sources conflict), **custom from ~$200/pool**, 1 free revision. Passive .zip delivery; no hosted link, no interactivity, no estimating.
- **Verdict:** not a software competitor — **evidence of willingness-to-pay (~$200/design, 3-day latency) for exactly what Pool Forge makes instant, interactive, and priced.** Conceivable early white-label drafting backend; their engineer-ready-drawings deliverable flags a real downstream need.

## Track 3 synthesis

- **None of the engines are embeddable** — D5, Lumion, Twinmotion are closed desktop GPU products with no APIs, no headless endpoints, no web SDKs. Integration is impossible; imitation is the play.
- **All three converged on the same customer delivery: a no-install link/QR in the mobile browser.** That's market proof of Pool Forge's delivery thesis.
- **Two architectures on display, and a third nobody ships:** (1) pre-baked panoramas — cheap, robust, non-configurable, trivially replicable (Lumion = CDN cubemap JPEGs + WebGL viewer); (2) cloud pixel streaming — fully interactive but session-capped/bandwidth-hungry/queued and $445-gated (Twinmotion Cloud); (3) **client-side WebGL/WebGPU in the customer's browser — the one none of them can ship, with no sessions, queues, or streaming cost. That's ours.**
- **Cheap wins to steal:** AI photo-inpainting concepts as top-of-funnel (commodity Replicate/Leonardo), the pano-link share pattern, WebAR placement as the demo hook (Latham's moment, minus the install).

---

---

# TRACK 4 — Estimating/CRM/proposal/financing stack (ProDBX, Poologics, Hearth, Houzz Pro, QuoteIQ, Jobber, JobTread, Pool Brain)

The "business half" builders bolt onto a design tool. Seven of eight are design-blind; all prices marked reported/approx. where vendor-gated. **§4.7 JobTread and §4.8 Pool Brain added 2026-08-28.** Pool Brain is filed here for convenience but is explicitly labelled an **adjacency, not a competitor** (see its entry for why that distinction is load-bearing).

Three of the eight are generalists rather than pool tools (Jobber, Houzz Pro, JobTread) and §4.7 draws the lines between them directly.

## 4.1 ProDBX — prodbx.com · **re-verified 2026-08-28; pricing, QuickBooks and AI all moved**

- **A:** All-in-one (CRM + estimating + PM + owned accounting) purpose-built for pool/fence contractors. Small install-base signal (GetApp 4.9/5 on only 14 reviews).
- **B:** Cloud web + iOS/Android; mobile-browser capable. Customer touches a **Customer Portal** (view/approve/e-sign docs).
- **C/D:** Business-only; no design/3D, no rendering.
- **E (their moat):** pool estimate templates, auto material+labor calc, and **live distributor pricing via DistributorConnect API (1,000+ US distributors, real-time branch inventory)**; Pool360/SCP supply feeds; estimates → proposals/contracts/change orders; POs, inventory, payroll/commission.
- **F:** Branded proposals + digital contracts, **e-sign yes**; **financing at proposal: none.**
- **G (moved):** `no AI` **→ AI shipped.** Nav carries "*Now Featuring AI in DBX*"; the [AI page](https://prodbx.com/ai/) is headlined *"AI Isn't Coming to DBX. It's Here"* and names four capabilities: Email Generations, Email Rewrites, Job Notes Reports, Company and Address Research. In the pricing table, "AI Notes Summarization & Research" is on all four tiers and "AI Content Generation" on Essential and above. **Note what it is not:** none of the four touch estimating. It is correspondence and research assistance bolted onto a CRM, not AI applied to the priced quote. The AI-estimating gap stands.
- **H (moved, and our old figures were wrong in a specific way worth understanding):** `Free CRM $0 / Express $19 / Professional $79 / Enterprise $119 per user/mo (GetApp-sourced)` **→** the vendor now self-publishes at [prodbx.com/pricing](https://prodbx.com/pricing/), and the shape is different:

  | Tier | List | 6-month intro | Seat minimum |
  |---|---|---|---|
  | Basic | **$19** | Free | new customers only |
  | Essential | **$59** | $39 | **min 5 users** |
  | Professional | **$99** | $79 | **min 5 users** |
  | Enterprise | **$139** | $119 | **min 10 users** |

  All per user/mo. Vendor footnote verbatim: *"Special Introductory Pricing currently available in limited quantities to new customers only, and available for the first 6 months of service."* **The figures in our 2026-07-24 entry were the promo column, not the list column**, mirrored from a GetApp listing that still shows the old tier names (CRM Only / Express / Professional / Enterprise) despite claiming an August 2026 update. Treat that GetApp page as stale.

  **The seat minimums are the real change in effective cost.** Professional at the 5-seat floor is **$495/mo list**, which reprices ProDBX from "cheapest per-seat option in Track 4" to "more expensive than Poologics for a small builder." Also published: 1,000 emails/mo free then $0.004 each; 100 SMS/mo free then $0.03 each.
- **I (corrected):** `notably no QuickBooks` **→ wrong as of 2026-08-28.** A [QuickBooks integration](https://prodbx.com/quickbooks/) exists, but it is thin and they say so themselves: *"The integration is one-way from ProDBX to QuickBooks"* and *"The integration does not transfer the complete ProDBX customer or job record."* Gated to Essential and above. DistributorConnect is still marketed and now names its feeds explicitly (*"Instantly connect with more than 1000 distributors across the US"*, with **Heritage Pool Supply Live Pricing** and **SCP/Poolcorp Live Pricing** as separate checked rows). Still no Zapier advertised. **Financing: still none** (no financing page in their 83-URL sitemap; their payments page covers ACH and cards only).
- **J:** Match distributor-price-feed estimating + pool templates. It's design-blind, financing-blind, small. **Win:** out-present it — our design→proposal front end vs its weak customer layer.

## 4.2 Poologics — poologics.com · **re-verified 2026-08-28; prices went up**

- **A:** Pool-specific CRM + estimating + proposals + PM; positioned as the migration target for Pentair Pool Builder refugees. iOS/Android apps.
- **C/D:** Business-only ("take-offs" = quantity takeoffs, not modeling). "Visual proposal editor" formats documents, not renders.
- **E (their moat):** unlimited estimates/proposals on **local pricebooks + price groups + budget accounts**, custom templates, estimate cloning, milestone payment schedules, warranties, punch lists, project accounting (cost overruns, profitability).
- **F:** Emailed proposals with **e-sign**, client comment threads, invoices + reminders. **Financing: none.**
- **G:** No AI (re-confirmed 2026-08-28).
- **H (moved: this is the only price increase found this pass):** `$249/mo annual · $279 quarterly · $299 month-to-month` **→ $279/mo annual (billed $3,348/yr, marketed as "Save 15% vs. Monthly Subscription") · $329/mo month-to-month.** **The quarterly tier is gone.** That is roughly **+12% annual and +10% monthly in about five weeks**, on the closest pure-play business rival in the market. Still flat per-company, no setup fee, but a cap is now published that was not there before: *"SOFTWARE SUBSCRIPTION INCLUDES UP TO 20 USERS - NEED MORE USERS? CONTACT US"*. Purchase is self-serve, not demo-gated: the buttons go straight to Stripe checkout.
- **H, trial (corrected):** `free trial unknown` **→ there is no free trial.** What they sell instead is a *"two-week onboarding"* with billing deferred: *"Our streamlined two-week onboarding process ensures your account is fully customized and your team is confident before you ever get billed."* The FAQ states no refunds before term end. That is a real competitive read: **Poologics has bet on human onboarding over self-serve**, which is slow, expensive, and exactly the thing a browser-native product with a working free tier can undercut.
- **H, do not confuse:** they also sell a Website Design & Build product at $139/mo annual or $159/mo monthly **plus a $1,999 one-time build fee**. That is not the software price and must never be quoted as such on a comparison page.
- **I (verified 2026-08-28, expanded):** **QuickBooks Online** ("Quickbooks Online Bill Integration"), Google Mail, Google Calendar, Outlook Mail, **Zapier**, and **Heritage** (*"Real-time access to products, pricing, and availability through direct integration with Heritage's ordering system"*). E-sign confirmed on the estimating page ("Proposal E-signatures"). **Financing: still none** (the only hit sitewide is passive: *"Whether your customers are paying out of pocket or receiving financing..."*, which is accommodation, not an offering). **AI: still none** in the platform; the only AI-adjacent string on the site ("SEO/LLM Page Optimizations") belongs to the website add-on. Open API: **not established**, nothing published.
- **J:** The closest pure-play business rival — match its pricebook/proposal flow. Design- and financing-blind. **Win:** bolt real pool design/visualization + embedded financing onto exactly this flow.

## 4.3 Hearth — gethearth.com (the financing-UX benchmark)

- **A:** Contractor **financing marketplace** + light quotes/contracts/invoices. 18+ lenders. Now layering AI ("Harper").
- **B:** Web + mobile app. Customer touches: online pre-qual form (**no credit impact**) + **monthly-payment estimates displayed beneath the quote total** + one-click digital approval.
- **E:** Light quoting only — not a pool estimator (no price book/takeoffs).
- **F (category benchmark):** loans **$1,000–$250,000**, terms 2–12 yrs, FICO from 550, from ~4.9% APR, plus 0% intro cards; quotes by email/text with digital approval + auto reminders; Hearth cites **92% of quotes sent with financing**. **$0 per-loan / $0 dealer fees.**
- **G:** Harper tier: AI receptionist, AI follow-up, loan-assist.
- **H:** Flat per-company annual; reported ~$1,499–$1,799/yr + $99 setup (vendor now gates pricing behind demo; range $2k–6k/yr by service level).
- **I:** Standalone layer — financing links/widgets embed into any quote. Deep CRM/QB/API integrations unconfirmed.
- **J:** Not a competitor — the **pattern to replicate or partner with**: "monthly payment beneath the total + no-credit-impact pre-qual + multi-lender waterfall + $0 dealer fee." A design→proposal app with this embedded removes a whole bolt-on subscription.

## 4.4 Houzz Pro — the closest analog to the full Pool Forge vision

- **A:** Houzz Inc.'s all-in-one for remodel/design pros: marketplace lead-gen + branded proposals + PM + **3D floor plans** + **embedded homeowner financing**. Not pool-specific.
- **C/D:** The only one in this track with real design — 3D floor plans, takeoffs, selections, mood boards. Interior/remodel, **not pool 3D**. Structurally proves the design→proposal chain.
- **E:** Estimates, invoices, takeoffs, bids, change orders, selections, budgets, branded proposals, contracts.
- **F (most complete chain here):** branded proposal → **e-sign contract + change orders** → **online payments** → **consumer financing auto-embedded on client-facing docs** via **Figure (HELOC), Affirm (3–36 mo BNPL), GreenSky, Intuit Credit Karma** — homeowner sees max funding, monthly payment, rate/term, applies inline; pro can toggle the badge.
- **H:** Free Basic; Pro is **volume-based (annual project volume)**; reported ~$55/mo entry → ~$399/mo Pro at standard volume; higher tiers quoted.
- **I:** **QuickBooks Online auto-sync (~5 min)**, built-in payments, four financing partners, Houzz lead-gen.
- **J:** The strategic benchmark for the whole chain (design→proposal→e-sign→pay→finance) — **win by out-verticalizing**: true pool 3D + pool-native estimating depth it doesn't have.

## 4.5 QuoteIQ — myquoteiq.com (the AI + price-floor benchmark)

- **A:** AI-first field-service estimating/CRM, pool-*service* leaning. Newer, aggressive AI marketing.
- **C/D:** No design. **MapMeasure Pro** (satellite deck-sqft/fence measurement) + AI Before/After images (equipment-upgrade viz).
- **E:** **AI Estimator (photo + job description → estimate)**; **Good/Better/Best options estimates** built in <2 min on mobile; satellite takeoffs; job costing; recurring billing. Service/repair-leaning, not construction docs.
- **F:** Homeowner sees all three tiers on one screen, picks, **e-signs poolside** (Beginner tier+ only), pays online. **Financing: none.**
- **G (their strength):** photo→estimate, AI call answering, review automation, AI website builder.
- **H:** Flat, 14-day trial: Essentials **$29.99/mo** (no e-sign) · Beginner $74.99 · Pro $149.99 (adds QuickBooks) · Elite $299 · Max $699.
- **I:** QuickBooks (Pro+), Stripe. No financing, API unknown.
- **J:** Watch its **photo→AI-estimate and Good/Better/Best one-screen UX** — that's the pattern to match; weak on design, big-build docs, financing.

## 4.6 Jobber — getjobber.com (the generalist gorilla)

- **A:** General field-service management (quotes/scheduling/invoicing/payments/CRM). Huge, mature, broad ecosystem. Pool-*service*, not pool-build.
- **C/D:** No design.
- **E:** Line-item quotes + templates + optional add-on upsells (line-item quoting gated to **Grow** tier); approved quote → job; automated follow-ups. **Pool gaps:** generic quoting — no pool price book, formulas, or construction takeoffs.
- **F:** **Client Hub** — passwordless self-serve portal (approve quotes, pay invoices/deposits, view appointments, request work). **E-sign/approval yes.** **Financing yes — Wisetack**: homeowner applies in under a minute, no credit impact, 3–60 months, as low as 0% for the customer, contractor pays flat **3.9%**.
- **H:** Core $29 · Connect $99 · Grow $149 · Team tiers to $599/mo; 14-day trial.
- **I (ecosystem benchmark):** QuickBooks Online, Stripe/Jobber Payments, Wisetack, **Zapier (1,500+ apps)**, App Marketplace, **open API**.
- **J:** Match its Client Hub portal + Wisetack pattern + QB/Zapier/API openness. It's pool-blind on design and estimating depth — the vertical is open.

## 4.7 JobTread — jobtread.com · **added 2026-08-28** (generalist construction, same shape as Jobber and Houzz Pro)

- **A:** End-to-end residential construction management (CRM → estimating → PM → job costing → customer portal). JobTread Software LLC, Dallas TX, **founded 2019 by Eric Fortenberry**. Scale signal, from their own press boilerplate dated 2026-05-27: **"more than 11,000 construction businesses"**, **#6 on the Deloitte Technology Fast 500 (2025)**, #1 fastest-growing tech company in North Texas two years running. This is the largest and fastest-growing vendor in Track 4 after Jobber and Houzz. Not a pool product, but it runs a **dedicated Pool Builders vertical page** ("Make a Splash in Your Pool Building Business") with three named pool-company testimonials (Helpflow Pools, D&J Development, AE Pools). Funding: **not established**, nothing published that I loaded.
- **B:** Cloud web app + native iOS/Android. Customer touches a **Customer Portal**; subs and vendors get their own portals. Portal users are **free and unlimited**, which is a pricing decision with teeth (see H).
- **C/D:** **No design of any kind.** No 2D drawing, no 3D, no rendering, no visualization anywhere in the platform. Their "Takeoff" is quantity takeoff with formulas, not geometry.

  **And here is the finding that matters most to us: JobTread has already built the seat we would sit in.** They treat design as somebody else's job and integrate to it. Their partner directory carries a **"Rendering & Design" partner category**, and they ship a native **[RENDR](https://www.jobtread.com/integrations/rendr) integration** whose whole purpose is *"takes your captured project data and automatically creates detailed estimate templates using real measurement parameters"*, letting contractors *"Instantly populate JobTread estimates using RENDR data"*. That is **geometry → priced estimate**, which is precisely the Pool Forge loop, already proven inside JobTread by an interior-scanning vendor with no pool competence whatsoever. (I could not enumerate the members of the "Rendering & Design" partner category: that directory is JavaScript-rendered and did not load. **Labelled gap.**)
- **E:** Estimating, **Cost Catalog** (their price book), Takeoff with formulas, Bid Requests, Budgeting, Change Orders, Job Costing, POs & Work Orders, **AIA payment applications**, Specifications, Selections & Allowances, Customer Invoices, Reporting & Dashboards. Genuinely deep construction finance, deeper than anything else in Track 4. **But it is generic:** cost codes, not pool cost codes. Their own pool-builder page names **zero** pool-specific features, templates, catalogs, or takeoffs. A pool builder brings their own price book or builds it.
- **F (the most complete close in Track 4 alongside Houzz Pro):** Customer Portal → **Contracts & eSignatures** → **Collect Online Payments** → **Homeowner Financing via Acorn Finance**. Verified figures from the [integration page](https://www.jobtread.com/integrations/acorn-finance): personal loans **"$1,000 to $100,000"**, home-equity products **"up to $500,000"**, terms **"as long as 12 years"**, **"Zero credit impact"** prequalification, a marketplace of **"30+"** lenders with **"12+ trusted lenders"** covering a wider credit spectrum, and **"No dealer fees"** with *"nothing for you to sign up for and nothing for you to pay."* The homeowner sees a *"View Financing Options"* button on the estimate or invoice online. **APR range: not published** (*"APRs vary depending on your customers' credit score"*), so do not quote one.
- **G:** An **AI Connector** is prominent in the nav ("Anything you can do in JobTread can now be supported through AI") and is listed as a native integration. **What it actually is, is not established:** `/integrations/ai-connector` returns 404 and I could not load a feature page for it. Third-party write-ups describe it as an MCP-style bridge, but I did not verify that and it should not be repeated as fact. **Labelled gap.**
- **H (the page the owner was looking at, and the most interesting pricing model in this dossier):** **$199/mo base + $20/mo per internal user**, first user included. Volume breaks on seats:

  | Internal users | Monthly | Annual |
  |---|---|---|
  | 1 | included | included |
  | 2-10 | $20 each | $16 each |
  | 11-20 | $15 each | $12 each |
  | 21-30 | $10 each | $8 each |
  | 31+ | $5 each | $4 each |

  Annual saves 20%. Verbatim terms: *"No contract & no setup fees"*, *"Free implementation, training, and support"*, *"Includes every feature - no hidden fees"*, unlimited jobs/documents/files, **unlimited free customer and vendor portal users**, plus free field-crew users who only upload photos, log notes and check off tasks. **There is no free trial**; instead a *"Risk-free, 30 day money-back guarantee for monthly subscription."*

  **Three things to steal from this model.** (1) **No feature gating at all.** Every other Track 4 vendor sells e-sign or QuickBooks as a tier upgrade (QuoteIQ gates e-sign above $29.99, Jobber gates line-item quoting to Grow); JobTread charges once and ships everything, which removes the entire "which tier do I need" conversation from the sale. (2) **Free external users.** The customer, the subs and the suppliers cost nothing, so the network effect is subsidised by the contractor's seat count rather than taxed. (3) **Free implementation and training included in the base price** is how they get away with no trial: the objection they are answering is "I will never finish setting this up", not "I want to try it."

  Worked comparison at real pool-builder headcounts: 3 users = **$239/mo**, 5 users = **$279/mo**, 10 users = **$379/mo**, 20 users = **$529/mo**. Against Poologics' flat $279/mo (annual, ≤20 users) they cross at exactly 5 users, and JobTread is cheaper below that and dearer above.
- **I:** **Open API** (`api.jobtread.com/pave`, a single-POST GraphQL-like "Pave" query language covering customers, vendors, jobs, locations, tasks, documents, custom fields, and **webhook subscriptions**, with an official API Developer Certification), **Zapier**, **QuickBooks Online**, Acorn Finance, Home Depot, Eagleview, CompanyCam, RENDR, Gusto, NiceJob, HoundDog, plus an open "Become an Integration Partner" intake form. **This is the most open platform in Track 4**, matching or beating Jobber.
- **J · How it differs from Jobber and Houzz Pro.** All three are generalists a pool builder might buy instead of a pool tool, but they are three different bets and the differences decide who we actually lose deals to:

  | | **Jobber** (§4.6) | **Houzz Pro** (§4.4) | **JobTread** (§4.7) |
  |---|---|---|---|
  | Core job | Field **service**: recurring visits, dispatch, one-off jobs | Remodel/design **projects** + lead generation | Construction **projects**: budgets, cost codes, phases |
  | Where the money logic lives | Quote → invoice | Estimate → invoice + marketplace leads | **Budget-first**: job costing, change orders, POs, sub billing, AIA |
  | Design | None | **Yes, 3D floor plans** (interior/remodel, not pool) | None, and deliberately **partnered out** (RENDR, "Rendering & Design" category) |
  | Financing | Wisetack, contractor pays flat **3.9%** | Figure / Affirm / GreenSky / Credit Karma auto-embedded | Acorn Finance, **$0 dealer fee**, 30+ lenders |
  | Pricing shape | Feature tiers $29 to $599/mo | **Volume-based on annual project revenue**, ~$55 to $399+/mo, higher tiers quoted | **Flat $199 + $20/seat, everything included** |
  | Lead gen | No | **Yes** (the Houzz marketplace is half the product) | No |

  Read plainly: **Jobber is the wrong shape for a pool builder** (it is built for the service company down the street, which is why Pool Brain positions against it in §4.8). **Houzz Pro is the closest to the full Pool Forge vision** but sells leads as much as software and prices on your revenue, which builders dislike. **JobTread is the one a serious pool construction company would actually pick today**: right shape, deepest construction finance, cleanest price, best integrations, zero design. Of the three it is the most likely to be sitting in the account when we arrive.

- **J · Verdict.** **Match:** the pricing model (flat base, cheap seats, free external users, no feature gating, implementation included) and the close (e-sign + payments + $0-fee financing). **Exploit:** it has no pool price book, no pool formulas, no pool takeoffs, no construction drawings, and no visualization at all, and their own pool-builder page proves it by naming none of these. **Win, and this is a strategic choice rather than a slogan:** the fastest path may be **not to compete with JobTread at all**. They have an open API with webhooks, a public integration-partner program, and a live precedent (RENDR) for exactly our data flow: capture geometry, push a populated estimate. Pool Forge as *"the pool design and takeoff front end for JobTread"* reaches 11,000 construction businesses without building CRM, job costing, AIA billing, or a financing partnership. Standalone remains the bigger prize; the integration is the cheaper beachhead, and the two are not mutually exclusive.

---

## 4.8 Pool Brain — poolbrain.com · **added 2026-08-28** · **ADJACENT, NOT A COMPETITOR**

**The verdict first, because it is the useful part.** Pool Brain is **recurring-maintenance service and route management**. It is not construction estimating and it is not a design tool. I read their own 150-plus-row feature matrix end to end and searched it for the words *design*, *3D*, *render*, *takeoff*, *construct*, *e-sign*, *signature* and *financ*: **none of them appear as features anywhere in it.** Their "Quotes (estimates)" section is repair-and-upsell quoting off a products/services catalog, not a construction bid: no cost codes, no change orders, no phases, no draw schedules, no construction documents. Their customer is a pool company with **trucks and routes**; ours is a pool company with **permits and excavators**. **They do not compete with Pool Forge, and we must not claim on a public comparison page that they do.** The only genuine overlap is a shared buyer, at companies that do both service and construction, which in Florida is common (see Market context: "Fountain Blue Pool **Service**" and "Bob's Pool **Service**" both appear in the top five *construction* permit pullers for their regions).

Saying this plainly is worth more than manufacturing a rivalry. It also makes them the single most obvious integration partner in the dossier.

- **A:** Pool Brain (Phoenix, AZ). Origin claim, quoted from their own comparison pages: *"Pool Brain's founder owned a pool company in Phoenix, AZ with 35+ trucks."* Positioning is explicitly **up-market within service**: *"Pool companies with 1 to 2 technicians want and need very different things than a company managing their field techs from a central location."* They are chasing Skimmer's graduates, not Skimmer's base. **Founding year: not established** from any vendor page I loaded (search results say 2018 and name Adam Beech as founder/CEO; the site itself states neither, so treat both as unverified). Their claim that *"the largest pool companies in the nation all use Pool Brain"* is unverifiable marketing and should never be repeated as fact.
- **B:** Web dashboard + **native iOS/Android technician app**, and they make a competitive point of it: *"App installs natively to the device and is not a 'web app'"*, *"App Works With No Cell Signal (even for logging in)"*, and *"No User Names Or Passwords"* (the app binds to the tech's phone number). Worth noting against our own thesis: **in the field-tech use case, native beats browser and they say so**. That is a fair limit on how far the browser-native argument carries. It does not apply to our use case (a homeowner opening a proposal), but we should be honest that it applies to theirs.
- **C/D:** No design, no visualization, none. Not applicable.
- **E:** Quotes/estimates from a products / services / **bundles** catalog with saved photos and PDFs per line item; automatic invoicing (flat rate or per visit, in advance or arrears); pricing set automatically by **service level and type**; **per-body-of-water pricing** as separate invoice lines; technician pay auto-calculated by service level and role. Then the domain depth: chemical dosing auto-calculated from tech readings, chemical usage and cost tracked per customer / job / property / body of water / technician, filter-clean and salt-cell auto-scheduling, alerts on chemistry / flow / leaks / time / cost with priority ordering, LSI history graphs, **route profit breakdown** (which properties are losing money), and technician scorecards. **No construction takeoffs, no cost codes, no change orders, no AIA, no bid requests, no construction documents.**
- **F:** Emailed quotes, **customer portal** (historical job and route-stop detail), and **proof-of-service emails with labeled photos** on job completion. **No e-signature and no financing** anywhere on their own matrix.
- **G:** **No AI features** found on the features page or anywhere in the comparison matrix.
- **H (published, but only if you read their JavaScript):** the pricing page renders `$ /Month` placeholders and fills the numbers in client-side, so a plain page load shows nothing. The vendor's own calculator constants in `themes/bridge-child/js/site.js` are `providesAccess = "50"` and `eachActiveFieldTechnician = "65"`, i.e. **$50/mo base covering unlimited office users, plus $65/mo per active field technician.** Their own comparison pages confirm the arithmetic in plain text: *"Price Comparison Based on 3 technicians servicing 80 pools a month each ... $245 / mo"* (50 + 3 × 65 = 245). Also published on the pricing page: *"ALL FEATURES + FREE SETUP"*, *"No hidden costs"*, and per the comparison charts a **"30 day free trial"** plus a **"30 day refund guarantee"**.

  A caution for anyone reusing this: the same page runs an ROI calculator asserting **$1,622/month of savings per technician** (chemical spend $272, retention revenue $350, training cost $420, office time $580). Those are vendor-asserted constants hard-coded in the same JavaScript file as the prices. **They are not evidence of anything** and must not be cited as market data.
- **I:** **QuickBooks Online two-way sync** (invoices, payments, refunds, and auto-created deposits, and they explicitly contrast this with a rival's one-way sync), **Heritage Pool Supply** (*"Product costs are auto-updated nightly if your cost with Heritage changes"* with bulk-unit conversion and markup-driven repricing), **WaterGuru** device telemetry, and an **open API**: *"Extensive API that enables any company to query their data and create their own integrations"*, plus a **"Master API Structure"** for querying all companies in a multi-brand organisation with one key. These appear in the comparison matrix, not on the features page, which is itself a lesson: **their comparison page is a better product spec than their product pages.**

### The artifact to copy: how Pool Brain's comparison pages are built

The owner wants to build one of these. Theirs is better engineered than it looks, and it also demonstrates the failure mode. Read on both counts.

**What works:**

1. **Hub plus spokes.** One hub at [/compare/](https://www.poolbrain.com/compare/), headlined **"POOL COMPANY SOFTWARE PLATFORMS · 160+ Features Compared"**, linking to **nine** individual rival pages: Skimmer, iON Pool Care, PoolCarePRO, Jobber, Pool Office Manager, Pay the Pool Man, Pool Service Software, Evosus LOU, and **"Pen and Paper"**. Including pen and paper is the smartest move on the page: it names the real incumbent, and it is the only "rival" that can never send a lawyer.
2. **The rival pages live on a separate subdomain** (`poolcompanysoftware.poolbrain.com`), not the main marketing site. Cheap SEO surface, keyword-loaded host, isolated from the product site.
3. **Two-column matrix, roughly 150 rows, ~17 categories** (Scheduling, Quotes, Jobs, Billing, Products & Services, Inventory, Customers, Chemistry, Equipment Management, Alerts, Service Levels, Technicians, Mobile App, Reports, Integrations, Multi-Company Access, Support). Pool Brain left, rival right.
4. **Four cell states, not two.** Green check (has it), red minus (does not), **pink question mark** (*"we couldn't find publicly available info on whether the competitor has the feature"*), and **short qualifying text instead of an icon**: *"auto-sync (1 way only)"*, *"no bulk unit conversion"*, *"signal required to login"*, *"no webhooks - less robust"*. The qualifying-text state is what stops the page reading as a checkbox massacre, and the question-mark state is what makes the rest of the checkmarks believable. **Copy both states.**
5. **Every row carries its own one-line definition** of what the feature means, so a check cannot be mistaken for a claim the reader does not understand.
6. **Three defenses, all worth reproducing in spirit:** a dated freshness stamp (*"Chart last updated on 7/18/26 based on publicly available info"*) with an explicit caveat that something may have shipped since; a correction invitation (*"See something that you don't think is accurate? Please let us know. We want this to be an honest, accurate and fair comparison."*); and a trademark disclaimer (*"All company, product and service names used on this website are for comparative purposes only."*).
7. **They concede the rival's territory instead of trashing it:** *"both platforms serve their target markets well but only Pool Brain has the advanced all in one features you need to grow your business or run a medium to large pool company efficiently."* The frame is **you have outgrown them**, not **they are bad**, and the CTA matches it: *"If you've outgrown Skimmer, it's time to switch to Pool Brain."* That framing is why the page survives contact with a skeptical buyer.
8. **There is a price row, and it is normalized to a stated scenario.** *"Price Comparison Based on 3 technicians servicing 80 pools a month each"*, then **$245/mo** *(no pricing tiers)* against Skimmer's **$480/mo** *(tier 2 pricing)*. Stating the scenario is what makes a price comparison defensible rather than cherry-picked. **Do this.**
9. **No lead gate.** The whole matrix is public, no email required. Given the goal is SEO and buyer self-qualification, gating it would defeat the purpose.

**And the failure mode, which they are actively demonstrating:** nine hand-maintained rival pages is nine maintenance obligations, and they are not keeping up. The Skimmer chart is stamped **7/18/26**; the Jobber and Pool Service Software charts are still stamped **8/20/25**, over a year stale. Worse, their **own self-claims have drifted apart across pages**: the Skimmer page says *"135+ combined years"* of pool industry experience while the Jobber and Pool Service Software pages say *"55+ years"*. Anyone reading two of their pages catches it. Their Jobber chart also prices Jobber at *"$349 / mo (feature-tier pricing)"* on a year-old snapshot, which we have no way to confirm is still right, and neither do they.

**The build instruction that falls out of this:** generate every rival page from **one structured data file** (one row per feature, one column per competitor, one `verified_on` date per column, one shared block of self-claims). One source, N rendered pages, one stamp per column that is honest per-competitor. Hand-authored comparison pages rot; generated ones can be re-verified column by column and re-stamped automatically. Our own dossier is already that data file in prose form, which is the cheapest possible head start.

- **J · Verdict.** **Match:** nothing, it is a different job. **Learn:** the comparison-page architecture above, and separately their **data modelling**, which is the best pool-domain modelling in Track 4: per-body-of-water pricing and workflow, and "service level + type" as a two-click preset that cascades into billing price, tech pay, required chemistry readings and workflow steps. The equivalent for us is **pool type + finish tier as a two-click preset that cascades into price book, takeoff formulas, and document set.** **Watch:** if Pool Brain ever adds construction quoting, it arrives with two-way QuickBooks, an open API and a distributor cost feed already built. **Partner, do not fight:** a pool company that builds and services wants both halves and neither of us wants to build the other one.

## Track 4 synthesis

- **Design is wide open**: 7 of 8 are business-only; only Houzz Pro has (non-pool) design. Nobody carries pool geometry into the estimate. That loop is Pool Forge's. **JobTread makes the gap explicit and monetisable:** it has a "Rendering & Design" partner category and a live RENDR integration that turns captured measurements into populated estimate templates. The seat exists, it is open, and nobody pool-native is sitting in it.
- **E-sign is table stakes** (6 of 8 have it; the two without are Pool Brain, which is an adjacency, and Hearth, which only does light quoting). We have accept-online; full e-sign parity is a must.
- **Financing is the sharpest wedge, with the bar already set**: Hearth (multi-lender waterfall, monthly payment beneath total, $0 dealer fee), Jobber (Wisetack 3.9% flat), Houzz Pro (four lenders auto-embedded), **JobTread (Acorn Finance: 30+ lenders, $1k to $100k unsecured plus home equity to $500k, zero credit impact, $0 dealer fee)**. **The three pool-vertical tools (ProDBX, Poologics, Pool Brain) still have none, all re-confirmed 2026-08-28**, the clearest consolidation gap in the market, and it has now held for at least a full research cycle. Note the direction of travel on price: **the generalists are converging on $0 contractor fee** (Hearth and JobTread both), which makes Wisetack's 3.9% the outlier and tells us what to negotiate for.
- **Pool-vertical AI is stirring but not where it matters.** ProDBX shipped AI in the last five weeks (email generation and rewrites, note summaries, company research). None of it touches the estimate. QuoteIQ's photo→estimate is still the only AI aimed at the priced quote in this track, and it is service-shaped. **AI applied to construction estimating remains uncontested.**
- **Estimating depth to match:** ProDBX's live distributor pricing (Heritage and SCP/Poolcorp feeds, 1000+ distributors); Poologics' pricebooks/price groups; QuoteIQ's photo→AI estimate + Good/Better/Best; **JobTread's Cost Catalog + formula takeoff + change orders + AIA**, which is the deepest construction finance in the track. Note that **Heritage appears in three separate vendors' integration lists** (ProDBX, Poologics, Pool Brain): a distributor cost feed is becoming table stakes, not a differentiator.
- **Integration must-haves:** QuickBooks Online, Stripe, one financing partner (Acorn/Wisetack/Hearth-style). **JobTread now matches or beats Jobber as the openness benchmark**: a documented open API (`api.jobtread.com/pave`) with webhook subscriptions, an API developer certification, Zapier, and a public integration-partner intake.
- **Pricing map (ProDBX, Poologics, JobTread and Pool Brain verified 2026-08-28; the rest as of 2026-07-24):** QuoteIQ $30–699 flat · Jobber $29–599 · **Poologics $279–329/co (was $249–299), capped at 20 users** · **ProDBX $19–139/user list with 5–10 seat minimums (was recorded as $0–119, which was the promo column)** · Houzz Pro ~$55–399+/mo volume-based · Hearth ~$1.5–1.8k/yr flat · **JobTread $199/mo + $20/user (≈$239 at 3 seats, $279 at 5, $379 at 10)** · **Pool Brain $50/mo + $65/active technician (≈$245 at 3 techs)** *(adjacency, service-side reference point only)*.
- **Two pricing shapes worth copying, and one to avoid.** Copy **JobTread's** flat base + cheap seats + free external users + zero feature gating + implementation included: it removes the tier conversation from the sale entirely. Copy **Pool Brain's** billing on the unit the customer actually counts (active technicians), not on office headcount. Avoid **ProDBX's** seat minimums, which turn a $99 list price into $495/mo for a five-person shop, and avoid **Poologics'** user cap, which punishes exactly the growth we want our customers to have.
**One-line read:** the winning wedge is a pool-native **design→estimate→proposal→e-sign→embedded-financing** loop that no incumbent closes today.

**Marked unknowns (updated 2026-08-28):** Hearth exact subscription $ (demo-gated) · Houzz Pro exact tiers (volume-based/quoted) · Hearth deep integrations · AI specifics in Jobber/Houzz Pro · Hearth free trial · **JobTread's AI Connector: what it actually is** (feature page 404s) · **JobTread funding** (nothing published) · **JobTread's "Rendering & Design" partner roster** (directory is JS-rendered, would not load) · **Poologics open API** (nothing published) · **Pool Brain founding year and CEO** (search says 2018 / Adam Beech; the vendor site states neither).

**Resolved since 2026-07-24:** ProDBX pricing is now vendor-published, not quote-based, and Poologics has no free trial (they sell deferred-billing onboarding instead).

---

# MARKET CONTEXT — who actually buys this (Florida permit data) · **added 2026-08-28**

Not a competitor. This section is the customer, and it is the only hard demand-side data in this dossier.

**Source:** HBWeekly, ["Florida's Leading Pool Builders: May 2025"](https://blog.hbweekly.com/floridas-leading-pool-builders-may-2025/). HBWeekly is a **construction permit data company**, tracking residential and commercial permits since **1992** across Florida, Georgia, Texas, Alabama and Oklahoma, and selling custom permit-data reports. Their business model is itself the first finding: **permit data is a purchasable, structured, monthly-refreshed lead list for exactly our buyer.** That is a channel Pool Forge can buy into rather than build, and it beats scraping.

**One month, one state:** *"1,885 new swimming pool construction permits on record statewide for the month, with construction values exceeding $156 million."* That is roughly **$83,000 average declared construction value per pool permit**, in a single state, in a single month.

**The market shape is a long tail, not a few giants.** Active pool builders on record by region: Southwest FL ~190 · Southeast FL ~180 · Tampa ~150 · Orlando 115+ · Jacksonville 80+. **Well over 700 permit-pulling pool builders in five Florida regions alone.** And the leaders are small: the highest permit count anywhere that month was **50**; most regional #1s pulled 14 to 41; regional #5s pulled **6 to 16 permits in a month**.

| Region | Active builders | #1 builder | Permits | Value | Avg/permit |
|---|---|---|---|---|---|
| Southwest FL | ~190 | Pinnacle USA | 50 | $3.54M | $70,880 |
| Southeast FL | ~180 | Fountain Blue Pool Service | 20 | $1.30M | $65,188 |
| Tampa | ~150 | T&D Pool Construction | 41 | $1.85M | $45,000 |
| Orlando | 115+ | Dreamscapes Pools & Spas | 25 | $1.17M | $46,729 |
| Jacksonville | 80+ | Agua Pools & Spas | 14 | $1.16M | $82,786 |

**The high-ticket end, which is where a design tool earns its keep:** Van Kirk Construction (SE FL) averaged **$193,275 per permit** on 10 permits; A&G Concrete Pools **$143,936**; Cody Pools **$151,580** in Tampa and **$130,887** in Orlando; Pools by John Clarkson (Jacksonville) **$136,768**. Cody Pools appears in the top five of **two** regions, i.e. a multi-market operator.

**What this implies about how they buy.** Flagged clearly: **these are inferences from job value and volume, not statements from the article.** The article says nothing about what software any of these builders use, what they pay for it, or how they choose it. Do not cite this as customer research.

1. **Average job value runs $45k to $193k.** At that ticket a $150 to $330/mo subscription is a rounding error against a single closed job, which is exactly why Structure Studios sustains $197/mo and Poologics just raised to $329/mo without apparent resistance. **Price on close rate, not on seats.** Nothing in this data supports competing on cheapness.
2. **Volume is low enough that per-project pricing is viable.** A regional top-five builder at 6 to 16 permits a month is doing roughly 70 to 190 pools a year. PoolDes (§3.6) charges ~$200 per design with a 3-day turnaround and that is a functioning business at this volume. A per-design or per-proposal price point is defensible here in a way it would not be in a high-volume trade.
3. **The buyer is a small business, not an enterprise.** A builder doing 10 permits a month has a handful of office staff. That argues for **JobTread's pricing shape** (flat base, cheap seats, free portal users) and hard against **ProDBX's 5- and 10-seat minimums** and **Poologics' 20-user cap**, and it argues against any per-seat model that taxes hiring an estimator.
4. **Several "leading pool builders" are named as service companies** yet pull construction permits: Fountain Blue Pool **Service** is #1 in Southeast Florida, Bob's Pool **Service** is #2 in Orlando. **The same company buys a route tool and a build tool.** That is the concrete, data-backed reason Pool Brain (§4.8) is an adjacency and a partner candidate rather than a rival, and it is a reason to make our export and API story good enough that a service platform can consume it.
5. **This is a ready-made named-account target list**, ~25 builders per issue with permit volume and dollar value attached, refreshed monthly, for five states. Combined with (1), the go-to-market motion writes itself: rank by average value per permit, not by permit count.

**Not established from this source:** what tools these builders use today, their software spend, their close rates, how many of the ~700 use anything beyond spreadsheets, or whether Florida generalises to Texas, Arizona and California. Florida is the largest and most permit-transparent pool market in the US, which makes it the best available proxy and still only a proxy.

---

# SCORECARD MATRIX — all competitors, one view

Legend: Browser = authoring runs in a browser · Mobile = customer can view on a phone browser · Photoreal 1–5 · Interact = what the customer can DO · Estimating = priced quotes integrated with design geometry · Price ≈ current. **Rows marked ✅ were re-verified against vendor pages on 2026-08-28; all others carry 2026-07-24 figures.**

| Competitor | Browser | Mobile (customer) | Photoreal | Customer interactivity | Estimating | ~Price |
|---|---|---|---|---|---|---|
| **Pool Studio** ✅ | ✗ (Win+RTX) | ✗ | 4 | Passive (designer-led) | Takeoffs, **no $** | $147/mo + $95 |
| **Vip3D** ✅ | ✗ | ✗ (VR export) | 4.5 | Passive | Takeoffs, no $ | $197/mo (promo gone) |
| **VizTerra** ✅ | ✗ | ✗ | 4 | Passive | Quantities ("doesn't build the quote for you") | $97/mo |
| **YARD** ✅ | ✗ (iPad app) | ✗ (native only) | 3.5 | In-person AR walk | ✗ | +$30/mo ($25 annual) |
| **Cedreo** | ◐ (desktop browser, mouse req.) | ◐ (stills only) | 4 (cloud farm) | Passive stills | ✗ | $129/mo + credits |
| **Realtime Landscaping** | ✗ (Win) | ◐ (video/pano) | 3 | View-only pano | Excel material list | $279–599 once |
| **Uvision (Unilock)** | ✗ | ✗ | 3 | Passive video | Unilock catalog | free to dealers |
| **PRO-SUITE** | ✗ (Office+RLA) | ◐ (360 files) | 3 | Passive | **Deepest** (DB→contract→Gantt) | ~$1,100 once |
| **PoolDraw** | ✗ (Visio) | ✗ | 2 | Passive | Estimates (dated) | ~$1,249 once (dormant) |
| **D5 Render** | ✗ (Win) | ✓ (baked tours) | **5** | Baked-tour navigation | ✗ | ~$360/yr |
| **Lumion** | ✗ (Win) | ✓ (360 panos) | 4 | Look-around | ✗ | $1,149/yr |
| **Twinmotion Cloud** | ✗ (Win/Mac) | ✓ (pixel-stream) | 4.5 | **Live navigation** (60-min cap) | ✗ | $445/yr (Cloud not free) |
| **MyPoolDesigner.ai** | **✓ (pure web)** | ✓ | 4.5 surface / 0 fidelity | Passive images | ✗ | $30–90/mo |
| **Latham AR** | ✗ (native app) | ✗ | 3 | AR place (in-app) | ✗ (separate desktop tool) | free (lead-gen) |
| **PoolDes (service)** | n/a | n/a (files) | 3 | Passive | ✗ (but engineer drawings) | ~$200/design |
| **ProDBX** ✅ | ✓ (business only) | ✓ (portal) | — | Approve/e-sign | Distributor-fed, **no design** | $19–139/user/mo list, **5–10 seat min** |
| **Poologics** ✅ | ✓ (business only) | ✓ (email proposal) | — | E-sign + comments | Pricebooks, no design | **$279–329/co/mo**, ≤20 users |
| **Hearth** | ✓ (financing) | ✓ | — | Pre-qual + approve | Light quotes | ~$1.5–1.8k/yr |
| **Houzz Pro** | ✓ | ✓ | floor plans | E-sign + pay + **finance** | Estimates, not pool | ~$55–399/mo |
| **QuoteIQ** | ✓ | ✓ | — | G/B/B pick + e-sign | AI photo→estimate, no design | $30–699/mo |
| **Jobber** | ✓ | ✓ (Client Hub) | — | Approve + pay + **finance** | Generic line-item | $29–599/mo |
| **JobTread** ✅ | ✓ (business only) | ✓ (free portal users) | — | E-sign + pay + **finance** ($0 dealer fee) | Cost catalog + formula takeoff, **no design** | **$199/mo + $20/user** |
| **Pool Brain** ✅ *(adjacent: service/routes)* | ✓ (business only) | ✓ (portal + proof-of-service) | — | View history; **no e-sign** | Service/repair quoting only, **no construction** | **$50/mo + $65/tech** |
| **→ Pool Forge (today)** | ✓ | ✓ (share link + accept) | 2 (massing) | **Interactive + live price + accept** | ✓ (pricebook + tax + geometry-fed) | — |

## The empty intersection (the strategy on one line)

Five columns; **no competitor holds more than three, and that is still true after adding JobTread and Pool Brain** (both are business-only: browser, mobile, interactivity, and no design at all). **Pool Forge already holds four, Browser + Mobile + Interactivity + Estimating, and is missing only Photoreal.** Every design incumbent has the opposite shape (photoreal, nothing else); every business tool has no design at all. Twenty-three profiles in, the empty intersection has not been entered by anyone.

### Strategic conclusions (ranked)

1. **Close the photoreal gap server-side** — the one missing column. Cedreo verifies the cloud-render-farm pattern ("5 minutes, no graphics card"); Blender/Cycles is the open-source version of it. Target D5's 5/5 as the *aspiration*, Pool Studio's 4/5 as the *bar*, and "credible water + materials + HDRI in a still/pano" as the shippable v1.
2. **The delivery thesis is market-proven.** D5, Lumion, and Twinmotion all converged on link/QR-in-the-mobile-browser. Ship the Lumion trick now (cubemap JPEGs + WebGL pano viewer on the share page ≈ zero cost), and hold client-side WebGL live-rendering as the differentiator none of them can ship.
3. **The close is uncontested among design tools, and the incumbent has now said out loud that it intends to stay that way.** No design competitor has e-sign, financing, or live pricing, and Structure Studios' own estimating page states that refusing to price takeoffs is deliberate: *"That is by design."* Table stakes from the business tools: e-sign parity, QuickBooks, Stripe, and an Acorn/Wisetack/Hearth-style "monthly payment beneath the total" (aim for the **$0 contractor fee** structure that JobTread and Hearth both now offer, not Wisetack's 3.9%).
4. **Steal three cheap funnels:** photo→AI-inpainted concept (commodity Replicate/Leonardo — MyPoolDesigner is just presets over it), WebAR pool-in-your-yard from a text link (Latham's proven hook minus the dead app), and manufacturer-funded white-label distribution (the Unilock/Uvision model, unexploited in pool).
5. **Displacement targets:** PoolDraw's builders (site down, Visio-locked), PRO-SUITE's estimating users (Frankenstack), PoolDes's customers ($200 + 3 days → instant), and Structure Studios' license-enforcement refugees (G2 ~1.9). **Add two, both surfaced 2026-08-28:** Poologics customers absorbing a ~12% price rise and a new 20-user cap, and ProDBX prospects who discover the 5-seat minimum turns a $99 list price into $495/mo.
6. **Consider the integration beachhead before the frontal assault (new, 2026-08-28).** JobTread has 11,000 construction businesses, an open API with webhooks, a public integration-partner program, a "Rendering & Design" partner category, and a live precedent (RENDR) for the exact data flow we produce: captured geometry → populated estimate. Pool Forge as the pool design and takeoff front end for JobTread reaches that base without building CRM, job costing, AIA billing or a lender relationship. Standalone is the bigger prize; this is the cheaper first door, and the two are compatible.
7. **Build the comparison pages from structured data, not by hand (new, 2026-08-28).** Pool Brain's nine-page comparison hub (§4.8) is the format to copy, including its four cell states, its per-row definitions, its dated freshness stamp, its correction invitation and its scenario-normalized price row. It is also the cautionary tale: their pages have rotted at different rates and their own self-claims now contradict each other across pages. Generate every page from one file with a per-competitor `verified_on` date. **This dossier is that file in prose form**, and the re-verification log at the top is the mechanism: and it must stay accurate, because everything in here is about to become a public claim about a named company.

*Dossier compiled 2026-07-24 from four parallel research tracks + live product inspection. Re-verification pass and two added profiles (JobTread, Pool Brain) plus market context: 2026-08-28. Unknowns are marked inline throughout; nothing is fabricated. Every figure carries the date it was last checked, and figures that moved are shown as `was → now` rather than overwritten.*
