# Pool Forge — Competitive Dossier: "Pool Design in the Browser"

Research date: 2026-07-24. Method: live product inspection where accessible (Cedreo planner driven directly; network + UI observed) plus deep web research for paywalled/desktop products. Every competitor is scored against the same framework so profiles are comparable. Unknowns are marked, never fabricated.

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

## 1.1 Pool Studio ($147/mo, or $125/mo annual, + $95 setup)

- **A:** Mid-tier, pool-focused CAD + real-time 3D for pro pool builders/designers. ([product page](https://www.structurestudios.com/pool-studio-3d-swimming-pool-design-software))
- **B:** Windows desktop install; Mac = "contact us." **Mobile browser: no.** Customer views on the designer's screen, exported media, or YARD iPad.
- **C:** 2D+3D one file, one-click switch. Freeform AND geometric pools, spas/raised spas, tanning ledges, step entries, water features, spillovers/scuppers, coping, decks, pergolas, fiberglass shells. **Parametric smart objects.** Library: **2,924 objects / 1,503 HD materials / 1,748 plants** (pre-V4). Import: AutoCAD DWG, GIS/aerial + parcel/setbacks, topo lines, scanned sitemaps. 3D praised as easy; 2D weaker than true CAD.
- **D:** Real-time on **local NVIDIA GPU (client-side)** — V4 path tracing + DLSS + dynamic GI. Photorealism **~4/5** (HDRI/4K-video/VR gated to Vip3D). Stills to 8K; video storyboard. Manual camera.
- **E:** Strong construction docs (triangulation, sqft/lf, material takeoffs, "Smart Data" like nozzle counts and raised-pool concrete). **No priced estimating, no price book, no tax, no quotes/proposals.**
- **F:** Customer = **passive viewer** of designer-led walkthroughs/exports. **No shareable link, no options-toggling, no live price, no e-sign, no financing.**
- **G:** **No AI.**
- **H:** Subscription per-seat, cancel anytime; 30-day trial, no card.
- **I:** Closed ecosystem. Import-only (DWG/GIS). No CRM/QB/financing.
- **J:** **Match:** parametric pool objects + trusted GPU realism. **Exploit:** Windows/RTX lockout + zero pricing + zero shareable link. **Win:** "any device, design a pool, send a live interactive priced link with one-click accept."

## 1.2 Vip3D ($197/mo, or $167/mo annual; promo ~$127/mo first 3 mo)

- **A:** Premium tier: Pool Studio + full landscape/hardscape + top-end viz + advanced docs. "Most Popular."
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
- **E/F/G:** Quantities-on-plans only; passive-viewer delivery; no AI.
- **J:** For the landscape adjacency: browser + solid 2D drafting + instant priced proposals undercuts their weak 2D and install barrier.

## 1.4 YARD ($30/mo add-on) — AR app

- **A:** AR companion that drops finished desktop designs into the real backyard on-site. Pro-facing, not homeowner self-serve.
- **B:** **Native iOS, iPad Pro with LiDAR required.** No Android, no web. Requires a paid desktop seat.
- **C/D:** Imports suite projects; on-site AR sketching; LiDAR-anchored 1:1 placement; ~3.5/5 mobile-AR fidelity. The one place the customer controls the camera (walking the iPad around).
- **F:** **In-person only, tethered to the pro's iPad.** No remote link, no take-home, no pricing/accept.
- **J:** **Exploit with WebXR/WebAR in the mobile browser** — the homeowner's own phone, via a share link, no $30 app, no iPad Pro. Turns AR from a supervised demo into a remote self-serve proposal.

## 1.5 Version 4 engine (launched April 7, 2026 — the render bar)

- **Tech:** path tracing + **NVIDIA DLSS** + fully dynamic global illumination — a native-GPU, game-engine-class real-time path tracer. **Computes on the client's local RTX GPU; no cloud farm anywhere.** Real-time preview; final photo/video renders queued/batched.
- **Fidelity ~4.5/5:** PBR materials, HDRI skies, **pool water caustics** + 12 water-feature options, day→dusk→night sun/moon, deep vegetation. Stills 8K, video 4K, one-click 360/VR (Vip3D).
- **V4 also added:** ~1,000 new assets (+456 plants, +148 materials, dynamic doors/rockwork), cross-section tool, scaled 3D plan views, bigger GIS, 2,550×2,550 ft grid.
- **V4 did NOT add:** any AI (DLSS aside), any pricing/proposal tooling, any web/share capability. Hardware floor went **up** (RTX 4060+).
- Sources: [Pool Magazine](https://www.poolmagazine.com/news/press-releases/structure-studios-launches-version-4-of-its-professional-pool-and-landscape-design-software-suite/), [V4 blog](https://www.structurestudios.com/blog/new-version4-vip3d-poolstudio-vizterra-update), [Green Industry Pros](https://www.greenindustrypros.com/design-installation/design/product/22964970/structure-studios-structure-studios-launches-v4-design-software-suite).

## Track 1 synthesis

| Dimension | Structure Studios | Pool Forge opening |
|---|---|---|
| Platform | Windows-only install; **RTX 4060+ required**; no browser/mobile (YARD = iPad-Pro-only) | Browser on any device, no install |
| Rendering | Best-in-class local-GPU path tracing (the bar) | Aim "great," not "equal"; server render + WebGL preview |
| Estimating | Takeoffs/quantities only — **no dollars anywhere** | Priced estimating + proposals = wide open |
| Customer delivery | Designer-led exports/VR/in-person AR; **no link/e-sign/financing/live price** | Shareable no-login interactive link + price + accept + financing |
| AI | **None** (2026!) | Photo→design, AI estimating, auto-camera all uncontested |
| Integrations | Closed | Open (QB, CRM, Hearth) |
| Reputation | Entrenched, but G2 ~1.9 with **aggressive per-seat license enforcement** + "combative" support complaints | Friendly licensing + self-serve onboarding wedge |

**Marked unknowns:** exact Mac path ("contact us"); active-user count; whether aggregator-listed "API access" is real (no public API documented); V4 exact render times; any undocumented share link (none found — appears absent).

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

# TRACK 4 — Estimating/CRM/proposal/financing stack (ProDBX, Poologics, Hearth, Houzz Pro, QuoteIQ, Jobber)

The "business half" builders bolt onto a design tool. Five of six are design-blind; all prices marked reported/approx. where vendor-gated.

## 4.1 ProDBX — prodbx.com

- **A:** All-in-one (CRM + estimating + PM + owned accounting) purpose-built for pool/fence contractors. Small install-base signal (GetApp 4.9/5 on only 14 reviews).
- **B:** Cloud web + iOS/Android; mobile-browser capable. Customer touches a **Customer Portal** (view/approve/e-sign docs).
- **C/D:** Business-only; no design/3D, no rendering.
- **E (their moat):** pool estimate templates, auto material+labor calc, and **live distributor pricing via DistributorConnect API (1,000+ US distributors, real-time branch inventory)**; Pool360/SCP supply feeds; estimates → proposals/contracts/change orders; POs, inventory, payroll/commission.
- **F:** Branded proposals + digital contracts, **e-sign yes**; **financing at proposal: none.**
- **G:** Automated follow-ups/texting; no AI estimating.
- **H:** Per-seat: Free CRM $0 / Express $19 / Professional $79 / Enterprise $119 per user/mo (GetApp; a pool round-up says "contact sales" — may be quote-based).
- **I:** DistributorConnect; notably **no QuickBooks** (owns its accounting), no Zapier advertised.
- **J:** Match distributor-price-feed estimating + pool templates. It's design-blind, financing-blind, small. **Win:** out-present it — our design→proposal front end vs its weak customer layer.

## 4.2 Poologics — poologics.com

- **A:** Pool-specific CRM + estimating + proposals + PM; positioned as the migration target for Pentair Pool Builder refugees. iOS/Android apps.
- **C/D:** Business-only ("take-offs" = quantity takeoffs, not modeling). "Visual proposal editor" formats documents, not renders.
- **E (their moat):** unlimited estimates/proposals on **local pricebooks + price groups + budget accounts**, custom templates, estimate cloning, milestone payment schedules, warranties, punch lists, project accounting (cost overruns, profitability).
- **F:** Emailed proposals with **e-sign**, client comment threads, invoices + reminders. **Financing: none.**
- **G:** No AI.
- **H:** Flat **per-company**: $249/mo annual · $279 quarterly · $299 month-to-month; no setup fee.
- **I:** **QuickBooks Online**, calendar sync, ApproveThis. Payments/API unknown.
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

## Track 4 synthesis

- **Design is wide open** — 5 of 6 are business-only; only Houzz Pro has (non-pool) design. Nobody carries pool geometry into the estimate. That loop is Pool Forge's.
- **E-sign is table stakes** (5 of 6 have it). We have accept-online; full e-sign parity is a must.
- **Financing is the sharpest wedge, with the bar already set** — Hearth (multi-lender waterfall, monthly payment beneath total, $0 dealer fee), Jobber (Wisetack 3.9% flat), Houzz Pro (four lenders auto-embedded). **The two truest pool competitors (ProDBX, Poologics) have none** — clearest consolidation gap in the market.
- **Estimating depth to match:** ProDBX's live distributor pricing; Poologics' pricebooks/price groups; QuoteIQ's photo→AI estimate + Good/Better/Best.
- **Integration must-haves:** QuickBooks Online, Stripe, one financing partner (Wisetack/Hearth-style). Jobber's Zapier/API is the openness benchmark.
- **Pricing map:** QuoteIQ $30–699 flat · Jobber $29–599 · Poologics $249–299/co · ProDBX $19–119/user · Houzz Pro ~$55–399+/mo volume-based · Hearth ~$1.5–1.8k/yr flat.

**One-line read:** the winning wedge is a pool-native **design→estimate→proposal→e-sign→embedded-financing** loop that no incumbent closes today.

**Marked unknowns:** ProDBX real pricing (may be quote-based) · Hearth exact subscription $ (demo-gated) · Houzz Pro exact tiers (volume-based/quoted) · Hearth deep integrations · AI specifics in Jobber/Houzz Pro · Poologics/Hearth free trials.

---

# SCORECARD MATRIX — all competitors, one view

Legend: Browser = authoring runs in a browser · Mobile = customer can view on a phone browser · Photoreal 1–5 · Interact = what the customer can DO · Estimating = priced quotes integrated with design geometry · Price ≈ current.

| Competitor | Browser | Mobile (customer) | Photoreal | Customer interactivity | Estimating | ~Price |
|---|---|---|---|---|---|---|
| **Pool Studio** | ✗ (Win+RTX) | ✗ | 4 | Passive (designer-led) | Takeoffs, **no $** | $147/mo + $95 |
| **Vip3D** | ✗ | ✗ (VR export) | 4.5 | Passive | Takeoffs, no $ | $197/mo |
| **VizTerra** | ✗ | ✗ | 4 | Passive | Quantities | $97/mo |
| **YARD** | ✗ (iPad app) | ✗ (native only) | 3.5 | In-person AR walk | ✗ | +$30/mo |
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
| **ProDBX** | ✓ (business only) | ✓ (portal) | — | Approve/e-sign | Distributor-fed, **no design** | $19–119/user/mo |
| **Poologics** | ✓ (business only) | ✓ (email proposal) | — | E-sign + comments | Pricebooks, no design | $249–299/co/mo |
| **Hearth** | ✓ (financing) | ✓ | — | Pre-qual + approve | Light quotes | ~$1.5–1.8k/yr |
| **Houzz Pro** | ✓ | ✓ | floor plans | E-sign + pay + **finance** | Estimates, not pool | ~$55–399/mo |
| **QuoteIQ** | ✓ | ✓ | — | G/B/B pick + e-sign | AI photo→estimate, no design | $30–699/mo |
| **Jobber** | ✓ | ✓ (Client Hub) | — | Approve + pay + **finance** | Generic line-item | $29–599/mo |
| **→ Pool Forge (today)** | ✓ | ✓ (share link + accept) | 2 (massing) | **Interactive + live price + accept** | ✓ (pricebook + tax + geometry-fed) | — |

## The empty intersection (the strategy on one line)

Five columns; no competitor holds more than three. **Pool Forge already holds four — Browser + Mobile + Interactivity + Estimating — and is missing only Photoreal.** Every design incumbent has the opposite shape (photoreal, nothing else); every business tool has no design at all.

### Strategic conclusions (ranked)

1. **Close the photoreal gap server-side** — the one missing column. Cedreo verifies the cloud-render-farm pattern ("5 minutes, no graphics card"); Blender/Cycles is the open-source version of it. Target D5's 5/5 as the *aspiration*, Pool Studio's 4/5 as the *bar*, and "credible water + materials + HDRI in a still/pano" as the shippable v1.
2. **The delivery thesis is market-proven.** D5, Lumion, and Twinmotion all converged on link/QR-in-the-mobile-browser. Ship the Lumion trick now (cubemap JPEGs + WebGL pano viewer on the share page ≈ zero cost), and hold client-side WebGL live-rendering as the differentiator none of them can ship.
3. **The close is uncontested among design tools.** No design competitor has e-sign, financing, or live pricing. Table stakes from the business tools: e-sign parity, QuickBooks, Stripe, and a Wisetack/Hearth-style "monthly payment beneath the total."
4. **Steal three cheap funnels:** photo→AI-inpainted concept (commodity Replicate/Leonardo — MyPoolDesigner is just presets over it), WebAR pool-in-your-yard from a text link (Latham's proven hook minus the dead app), and manufacturer-funded white-label distribution (the Unilock/Uvision model, unexploited in pool).
5. **Displacement targets:** PoolDraw's builders (site down, Visio-locked), PRO-SUITE's estimating users (Frankenstack), PoolDes's customers ($200 + 3 days → instant), and Structure Studios' license-enforcement refugees (G2 ~1.9).

*Dossier compiled 2026-07-24 from four parallel research tracks + live product inspection. Unknowns are marked inline throughout; nothing is fabricated.*
