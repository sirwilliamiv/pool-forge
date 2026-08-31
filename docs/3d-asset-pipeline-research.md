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
