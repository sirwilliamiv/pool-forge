# 3D asset pipeline research

Researched 2026-08-30. Three candidate pipelines for getting 3D content into
Pool Forge, each of which turned out to be a different product with its own
clear winner, plus the delivery pipeline they all share.

Related docs: `3d-object-library.md` (what the catalog needs to compete with),
`lidar-capture-contract.md` (the heightfield contract the backyard scan feeds).

---

## Decision summary

| Track | Verdict | Cost |
|---|---|---|
| Catalog from product photos (image-to-3D) | Ship now. Tripo API hosted, TRELLIS.2 local | $0.30-0.60/asset hosted; pennies local |
| Store/home-show scanning iOS app | Build on Apple Object Capture; background upload, not streaming | ~$1/scan to validate via KIRI before writing Swift |
| Guided backyard scan (consumer) | The moat feature; nobody does it; enabled by site-import footprint | Engineering only, off-the-shelf components |
| Buying marketplace models | Rejected as a foundation; licenses forbid SaaS GLB delivery | (baseline: commissioned assets run $150-300 each) |

Sequence: catalog first, $1 KIRI validation before building the store app,
backyard scanner as the compounding play on top of site import.

---

## Track 1: Image-to-3D for the product catalog

The melted-blob era ended in early 2025 with Hunyuan3D-2 and TRELLIS. Furniture
is one of the easier categories (rigid, convex, simple silhouettes). Verdict
from 2026 archviz comparisons: props at patio viewing distance are
client-presentation ready; thin structures (wicker weave, sling mesh, umbrella
ribs, chair legs) still betray AI origin in close-ups.

### Hosted (recommended: Tripo)

| Service | Cost/asset | Notes |
|---|---|---|
| **Tripo** ([pricing](https://developers.tripo3d.ai/en/pricing)) | $0.30 standard, ~$0.60 with HD texture + quad retopo | 20-60s, cleanest topology, multiview input at same price, GLB out. Best fit for real-time poly budgets |
| Meshy ([pricing](https://www.meshy.ai/pricing)) | ~$0.60 | Best textures out of the box; multi-view up to 4 images |
| Hunyuan3D v3 via [fal.ai](https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d) | $0.375-0.68 | Pure pay-per-use, no subscription |
| Rodin / Hyper3D | $0.50-1.50 | Highest fidelity; hero assets only |

A 200-SKU catalog costs roughly $60-120 one-time. Feed multiple catalog angles
(2-4 views) wherever available; multiview fixes the hallucinated-backside
failure class.

### Local (recommended: TRELLIS.2)

- **[Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2)** (Dec 2025,
  4B params, **MIT license**): best open-source quality, real PBR, GLB out.
  Official target is a 24GB NVIDIA GPU (seconds per asset); the trellis-mac
  MPS port runs ~3.5 min/asset on an M4 Pro. Generational upgrade over
  anything TripoSR-era running locally today.
- **Avoid self-hosting Hunyuan3D 2.x** despite its quality: the Tencent
  Community License excludes the EU, UK, and South Korea entirely and carries
  an MAU ceiling ([license](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE)).
  A real problem for a SaaS. Using it via a paid API (fal) sidesteps
  self-hosting terms.
- TripoSR / Stable Fast 3D / InstantMesh are superseded; SF3D's license is
  also revenue-capped at $1M.

Hosted wins unless volume gets high or catalog images cannot leave the machine.

---

## Track 2: Store and home-show scanning app

### Capture: photogrammetry, not LiDAR

iPhone LiDAR depth is 256x192 px, roughly cm-accurate, and poor on small/near
objects. Every serious scanning app (Polycam, Scaniverse, KIRI) uses RGB
photogrammetry or 3DGS in object mode; LiDAR's real jobs are metric scale and
the live coverage UI. Luma is effectively in maintenance mode (company pivoted
to generative video); do not build on it.

Build on **RealityKit Object Capture** (`ObjectCaptureSession`, iOS 17+):
guided 3-orbit capture UX, automatic object segmentation, LiDAR-derived scale.
The key API gift is **`isOverCaptureEnabled`**: capture more and higher-res
images than on-device reconstruction uses, precisely so they can be shipped
off-device for higher-quality cloud reconstruction
([Apple docs](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture)).
Expect 3-5 minutes per product on the floor, ~150-250 HEICs with embedded
depth, gravity, and poses.

### Transport: do not stream, pipeline

A 2-minute product scan is 0.4-1 GB (stills) or ~350-550 MB (HEVC video +
depth + poses). Finishing upload as capture ends needs 25-60 Mbps sustained up,
which big-box WiFi and metal-roof cellular will not reliably give. Live
RGBD-streaming exists ([NeRFCapture](https://github.com/jc211/NeRFCapture),
[record3d](https://github.com/marek-simonik/record3d)) but is LAN-grade; no
commercial SDK streams.

The pattern that actually solves "no gigabytes of patio chairs on the phone":
**chunked background upload starting mid-capture (multipart to GCS), delete
local data on server checksum ack.** The phone holds at most 1-2 in-flight
scans; a dead-WiFi aisle degrades to "uploads finish in the parking lot"
instead of "scan failed".

### Cloud reconstruction

- **RealityScan CLI** (ex-RealityCapture, Epic): free under $1M annual
  revenue, best-in-class mesh quality, automatable. Or macOS
  `PhotogrammetrySession` full-detail on a Mac worker (headless CLI supported;
  "cloud" means Mac hardware).
- Open fallback: COLMAP + OpenMVS, with ARKit poses injected to skip the SfM
  solve.
- Splats (nerfstudio/gsplat, [Brush](https://github.com/ArthurBrussee/brush))
  plus SuGaR/2DGS mesh extraction for glass and chrome pieces that classic
  photogrammetry fails on.
- Turnaround: 30-60 min/product wall-clock on one GPU box, parallelizable.
- **Cheapest validation of the whole idea: [KIRI Engine API](https://www.kiriengine.app/api)
  at $1/scan** (photos in, GLB out, including 3DGS-to-mesh). Scan ten chairs
  with a stock capture flow before writing any Swift.

### Post-processing

gltf-transform to Draco/meshopt + KTX2 GLB, ~50-150k tris decimated to budget,
2k PBR, floor-aligned, real-world scale from LiDAR.

### IP note (not legal advice)

Furniture shape is generally not copyrightable (useful-article doctrine,
Star Athletica). Real risks: trade dress on distinctive designs (stripping the
logo does not cure it), design patents on new lines, trademarks baked into
textures, and store policy. Get permission to scan on premises, strip logos,
avoid brand names in the catalog. The stronger play is manufacturer
partnerships: their SKUs appearing in contractor proposals is a pitch, not a
liability. IP-counsel pass before the catalog ships publicly.

---

## Track 3: Guided backyard scan for a consumer app

The idea: the app already knows the address, satellite image, and
grid-snapped building footprint (site import). Use that to guide a homeowner
on an optimized capture lap, within ~10 ft of what they scan.

**Nobody does this.** Structure Studios YARD is the closest and only does AR
preview placement (LiDAR for occlusion, no terrain capture). Yardzen is 2D
photos; iScape is live AR overlay. Pros fly drones instead. The lane is open,
and the footprint prior is exactly what makes a guided lap possible.

### Capture

- **LiDAR is near-useless in direct sun** (solar IR washout on top of the 5m
  range). The stack is RGB video or 2-3 fps stills + ARKit world-tracking
  poses; LiDAR depth recorded opportunistically in shade as a prior only.
- ARKit VIO drift over 30-100 ft loops is manageable (~0.2 m class, with
  relocalization closing loops to decimeter level); offline SfM re-solves
  poses globally anyway, so live drift mainly affects the guidance overlay.
  Risk: featureless open lawn degrading tracking mid-lap; mitigate with
  waypoint stations rather than continuous-path dependence.
- Lap generation: offset the building footprint and parcel edge to a path
  8-10 ft off the surfaces of interest, 6-10 waypoint stations at corners and
  mid-spans. Two height passes (chest-high lap, then a slow pan from a
  vantage) materially improve terrain coverage.
- Guidance UX patterns that work (Object Capture, Hover, Polycam guided
  mode): show what has been captured (coverage paint/heatmap), AR waypoints
  over free path-following, a reticle that reacts too-close/too-far, and an
  explicit return-to-start leg that doubles as loop closure. Coach for
  overcast or morning/evening light.

### Georeferencing: the footprint is the datum

- ARKit `ARGeoTrackingConfiguration` and every VPS (Niantic, ARCore
  Geospatial) are built from street-facing imagery and **do not work in
  fenced backyards**. iPhone GPS is 2-5 m horizontal, worse vertically.
- Instead: GPS seeds rough placement, then match reconstructed house wall
  planes and corners to the grid-snapped footprint for the similarity
  transform (scale already metric from ARKit). The existing site-import
  drag/nudge confirm UI is the escape hatch. Strictly better than any VPS
  option in this environment.

### Processing and output

Frames + ARKit poses, then COLMAP refinement with pose priors, then
2DGS-style splat training with mesh/TSDF extraction (nerfstudio/gsplat,
[DN-Splatter](https://maturk.github.io/dn-splatter/)), ground filtering
(cloth-simulation/SMRF style, as in OpenDroneMap DTM extraction), then a
heightfield clipped to the parcel and tied vertically to the house-slab datum,
plus fence/structure polylines and tree instances. This feeds the existing
heightfield capture contract directly. 2DGS beats 3DGS for metric surfaces;
splat visual quality does not imply geometric accuracy.

**Honest accuracy: design-grade, not construction-grade.**

- Relative terrain near the path: 1-3 in (grass adds 1-2 in of surface noise).
- Cross-yard elevation (house to back fence): 2-6 in uncertainty without
  control; tying to the slab datum and hardscape planes is the cheap fix.
- Horizontal placement vs parcel: 0.5-2 ft, driven by footprint alignment.
- Builders grade to +-0.5 in and topo surveys report to 0.01 ft.

Position it as replacing the tape measure and the first site visit, with
"verify grade before excavation" on anything derived. This matches the
existing coverage-mask honesty rule in the capture contract.

Secondary deliverable: keep the splat itself as a photoreal backdrop and
render the proposed pool inside the actual yard.

---

## Cross-cutting: delivery pipeline and the buy option

### GLB ingest pipeline (every source goes through it)

Standardize on **gltf-transform** as the single ingest step:

```
gltf-transform optimize in.glb out.glb \
  --compress meshopt \
  --texture-compress ktx2 \
  --texture-size 1024 \
  --simplify true --simplify-error 0.001
```

- Meshopt over Draco (near-instant decode, drei `useGLTF` supports both).
- KTX2/BasisU is the big win: textures stay compressed on the GPU (~10x VRAM),
  which is what matters with 20-50 resident assets. ETC1S for albedo/AO,
  UASTC for normals.
- Budgets: 2-8k tris per furniture asset at LOD0 (one hero asset up to
  15-20k), 500-1.5k at LOD1; ~1-2 MB KTX2 textures; GLB under ~3 MB. Scene
  total under 500k tris desktop, 150k mobile, and under ~200 draw calls, so
  instance repeated SKUs (drei `<Instances>`, 1-2 materials per asset enforced
  at ingest).
- Loading: `useGLTF` + `useGLTF.preload` on catalog hover, `<Suspense>`,
  `<Detailed>` for LODs, hash-named immutable CDN URLs.

### Splats in the editor: no for catalog, yes for context

[Spark](https://github.com/sparkjsdev/spark) (World Labs) is the leading
three.js splat renderer and mixes with mesh scenes in R3F. But splats bake
lighting into spherical harmonics: no relighting under the scene sun, no
casting or receiving shadows, no material edits, no instancing wins. Wrong
format for catalog assets; right format for a scanned backyard as the context
environment under mesh furniture (with a shadow-catcher plane faked under
placed objects).

### Marketplace models: the redistribution trap

TurboSquid, CGTrader, and Fab/Sketchfab royalty-free licenses all forbid
distributing models in a form end users can extract. A SaaS serving plain GLB
over HTTP is exactly that (network tab, save-as); CGTrader explicitly requires
preventing end-user access to the raw asset. Meshopt-compressed GLB is not a
proprietary format. BIMobject and 3D Warehouse terms are similarly
design-project-only. So marketplaces are reference and stopgap, not
foundation.

Clean sources: CC0 ([Poly Haven](https://polyhaven.com/models),
[pmndrs market](https://market.pmnd.rs/), CC0-filtered Sketchfab), thin on
outdoor furniture; commissioned assets at $150-300 each (owned outright,
budgets specced up front), which makes a 100-asset commissioned library
$15-30k. That number, not the $30 marketplace sticker, is the baseline the
generation and scan pipelines beat.

---

## Key sources

- TRELLIS.2: <https://github.com/microsoft/TRELLIS.2> · Hunyuan3D 2.1 license:
  <https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE>
- Tripo API pricing: <https://developers.tripo3d.ai/en/pricing> · Meshy:
  <https://www.meshy.ai/pricing> · Hunyuan3D v3 on fal:
  <https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d>
- Furniture-class comparisons:
  <https://ideate.xyz/blogs/posts/ai-3d-model-comparison-trellis-tripo-meshy-rodin-hunyuan> ·
  <https://visiomake.com/en/blog/best-ai-image-to-3d-tools-2026-comparison-archviz>
- Object Capture: <https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture> ·
  quality study: <https://pmc.ncbi.nlm.nih.gov/articles/PMC11637407/>
- iPhone LiDAR accuracy: <https://www.scanmanifold.com/blog-posts/lidar-on-iphone-how-accurate-is-it-plus-the-biggest-errors-that-manifold-corrects>
- KIRI Engine API: <https://www.kiriengine.app/api> · RealityScan pricing:
  <https://flypix.ai/reality-capture-pricing/>
- ARKit VIO drift benchmark: <https://www.mdpi.com/1424-8220/22/24/9873> ·
  ARGeoTracking coverage: <https://developer.apple.com/documentation/arkit/argeotrackingconfiguration>
- DN-Splatter: <https://maturk.github.io/dn-splatter/> · 2DGS metric accuracy:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC12300396/>
- Hover guided exterior capture: <https://hover.to/how-it-works/> ·
  Structure Studios YARD: <https://www.structurestudios.com/yard>
- gltf-transform: <https://gltf-transform.dev/> · Spark:
  <https://github.com/sparkjsdev/spark> · Spark 2.0:
  <https://www.worldlabs.ai/blog/spark-2.0>
- TurboSquid license: <https://www.turbosquid.com/licensing> · CGTrader RF
  license: <https://help.cgtrader.com/hc/en-us/articles/360015124437-Royalty-Free-License>
- Useful-article doctrine: <https://www.wardandsmith.com/articles/applying-copyright-law-to-useful-articles>

---

## Addendum: terrain data and capture accuracy (2026-08-31)

Findings from the first real field test and the follow-up research. These
change the Track 3 recommendation, so read them before building on it.

### Free public terrain does not work on flat Tampa lots

Verified directly against 3014 W Ballast Point Blvd (lat 27.8896652,
lng -82.4927657) using the live services, not documentation:

- **USGS 3DEP has no 1 m data at this address.** The raster catalog
  (`elevation.nationalmap.gov/.../3DEPElevation/ImageServer/query`) returns
  three real datasets, all 1/9 arc-second (3.44 m cells):
  `ned19_..._fl_hillsborough_east_2007`, `..._nrthrnhillsbourough_2011`, and
  `..._hillsboroughmanatee_2010`. Nearby markets do better (Clearwater, Lutz,
  Sarasota, Orlando have 1 m from 2018; Miami 2024), and FY24 QL1 updates for
  Hillsborough and Pinellas are reported underway.
- **A 441-point grid over a 50 m block** gives best-fit slope 0.48% (0.6 in
  per 10 ft), total fall 9.4 in, residual roughness 4.4 in. The whole
  elevation signal is about twice the data's own scatter.
- **Hillsborough County publishes 2 ft contours**
  (`maps.hillsboroughcounty.org/arcgis/rest/services/InfoLayers/Contours_2ft`).
  Across a 120 m box centred on the house there are exactly two distinct
  contour elevations, 10 ft and 12 ft. A lot that falls 9 in cannot be
  described by a 2 ft interval.

Conclusion: on flat Florida lots the free public terrain says "it is flat" and
nothing more. Keep it for a sanity check against a wild capture and for rough
drainage direction; do not let it reduce what the phone must measure.

Watch the Web Mercator trap: requesting by pixel size in EPSG:3857 at Tampa's
latitude under-delivers by 1/cos(27.9 deg) = 1.13x. Request by bbox plus an
explicit `size`, or use UTM 17N.

### The phone's strong axis is vertical

Krausova et al., *Sensors* 2025, 25, 6141 (iPhone 14 Pro, outdoor terrain,
total-station ground truth), DOI 10.3390/s25196141:

- **Freehand whole-area scanning failed outright** and was excluded from the
  results: "significant positional deviations, ranging from tens of
  centimetres to metres". A continuous free walk over a yard is the documented
  failure mode.
- Vertical error is consistently far smaller than horizontal, because
  time-of-flight measures depth directly while horizontal accumulates SLAM
  drift. Sectional scanning in ~20 m segments, each tied to its own control:
  **vertical RMSE 0.16 m**; short controlled segments reached 0.12 m.
- A 180 m walk controlled only at the start: horizontal RMSE 0.845 m.
- Loop closure materially improves medium outdoor areas (ISPRS
  XLVIII-2/W8-2024 p.431).

So: lean on vertical, tie horizontal to tapped features rather than trusting
SLAM across the yard, and take a control tie roughly every 20 m of walking.
One benchmark per capture is not enough.

**Correction to an earlier claim in this document:** the assertion that
iPhone LiDAR is unusable in direct sun could not be verified in any
peer-reviewed or first-party source. Apple documents only that it "works both
indoors and outdoors" to 5 m. Treat sun failure as plausible trade-press
report, not established fact.

### Prior art and positioning

- **Aurora Solar is the precedent.** NREL validated average edge-length error
  0.52 ft and slope error 1.54 deg, 98% compliance against Aurora's published
  thresholds of 1.5 ft and 5 deg. Their Terms carry the load-bearing sentence:
  the service "shall not be deemed a substitute for an actual in-person
  analysis conducted at a given site", while marketing says "no truck roll".
- **Structure Studios already ships auto-terrain** at roughly $10-12 per
  address from commercial imagery, landing inside their hand-editing slope
  tool rather than as a locked layer. Auto-terrain is not the differentiator;
  copy the baseline-then-refine interaction model.
- Their inline caveat is the phrase to borrow: **"planning grade, not survey
  grade"**, placed where the number is used rather than in a footer.
- **Lead with provenance, not disclaimers.** Aurora shows dataset, capture
  date and point density with a plain-language scale. Staleness, not
  resolution, is what every vendor critiques in public lidar.
- **Canvas.io / Occipital (now Twindo) refuses this use case outright**: they
  will "reject such scans" of "landscaping, topography, and other natural,
  non-structural elements". The most experienced iPhone-LiDAR capture vendor
  declines backyard topography.
- **RTK is the productized path to real accuracy.** Pix4Dcatch with an Emlid
  Reach RX2 or Trimble Catalyst rover geotags frames at capture instead of
  registering afterwards: <10 cm typical, <5 cm best case, hardware ~$2-3k.
  This is a natural pro tier, not an engineering problem to solve.

### Two constraints that scope the product

1. **Google Solar API is licensed only for energy systems.** Maps Service
   Terms 20.1 permits use "only (a) to determine the feasibility of installing
   energy systems... (b) to design or install an energy system, or (c) for a
   Downstream Transaction", with a 30-day caching cap. Pool siting is outside
   the grant, and `buildingInsights` is currently how both the web app
   (`site-geo.ts`, import the building footprint) and the capture app obtain
   footprints. Needs replacing: Microsoft Building Footprints (ODbL), OSM, or
   county parcel services. Google's DSM is photogrammetry and ML, never lidar,
   referenced to a global geoid rather than NAVD88, with documented
   foreshortening near sharp edges "of a magnitude of perhaps 1-2 feet".
2. **Florida pool permits require a grading and drainage plan with existing
   elevations sealed by a licensed surveyor.** This product serves design,
   feasibility and estimating, never the permit set. That is a hard boundary
   to state in the UI, and it also removes most of the liability weight from
   the accuracy numbers, because nothing produced here is the document of
   record.

### Where Track 3 lands

Phone-only dense scanning of a yard is the documented failure mode, and UX
cannot fix it. But the phone measures height to roughly 5-6 in when it gets
periodic control, and height is the number a pool needs.

- **Consumer tier: phone only, guided sparse measurement.** Vertical-led,
  horizontal tied to tapped features, loop closure kept, photos still captured
  for the photoreal backdrop. Positioned as Aurora positions theirs.
- **Pro tier: the same app plus an RTK rover**, for sub-4-inch work.

Open item: Hillsborough County's licensing position on their GIS layers has
not been confirmed in writing. USGS data is public domain with no
restrictions; Mapbox forbids caching elevation, and Google's Elevation API
forbids building terrain models, so going direct to USGS and the county is
the only clean path.
