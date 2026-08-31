# Site capture contract, v1

What an iPhone sends Pool Forge after somebody walks a backyard, and what
happens to it.

This document is written for whoever builds the iOS side. It should be enough
to implement against without asking questions. Where it and
`src/modules/capture/contract.ts` disagree, the Zod schema in that file is the
arbiter and this document is the bug.

---

## 1. What this is, and what it is not

A builder (or a homeowner) walks the yard holding an iPhone, in lawnmower
stripes, and ARKit paints the ground as they go. The phone's LiDAR is good to
about five metres and degrades in direct sun, so full-yard coverage comes from
the walking pattern, not from the range of the sensor. The app shows coverage
being crossed off in real time so the person knows when they are done.

**What is uploaded is not a mesh and not a point cloud.** It is a heightfield: a
regular grid of ground elevations, plus a coverage mask saying which cells were
actually measured and which were never walked.

The coverage mask is the reason this feature exists. An interpolated surface and
a measured one produce the same mesh, the same contours and the same cut and
fill; the difference between them is a number on a signed contract. Pool Forge
already refuses to price a deck it cannot price and says "drawn but not priced"
instead. The same rule holds for dirt: any volume derived from ground nobody
walked says so, in the place the volume is shown. The mask is the only thing
that knows which is which, so the mask is required, and it is kept for the life
of the project.

**Out of scope for v1, deliberately:** meshes, point clouds, textures, photos,
object detection, and rotating a capture onto a plan. See §11.

---

## 2. Units

**The wire is metres.** ARKit is metric, and asking the phone to convert would
mean two codebases holding the same constant.

Pool Forge is inches for position and feet for height. The conversion happens in
exactly one file, `src/modules/capture/units.ts`, at ingest, and a test
(`src/test/unit/capture/units-boundary.test.ts`) reads the source of every other
file in the capture module and fails if any of them contains `3.28`, `39.37`,
`0.3048`, `0.0254` or `25.4`.

The iOS app should hold the same rule in reverse: send metres, never convert.

| Quantity | On the wire | In Pool Forge |
|---|---|---|
| Cell size, origin, benchmark position | metres | canvas inches |
| Elevation from ARKit | metres | feet on the site datum |
| Benchmark's real height | **feet** (see §5) | feet |

The one field on the wire that is not metric is `benchmark.siteElevationFt`,
because it is not an ARKit measurement: it is what the builder typed, and
builders speak feet. It is named for its unit for that reason.

---

## 3. The endpoint

```
POST /api/capture/heightfield
Content-Type: application/json
Cookie: <the authenticated session>
X-PoolForge-Project: <projectId>
X-PoolForge-Anchor-X: <optional, feet>
X-PoolForge-Anchor-Y: <optional, feet>
```

The heightfield document is the entire request body. The project id and the
placement travel as headers so the body stays exactly the survey artefact
described below, with nothing of Pool Forge's own in it.

- **Authentication** is the ordinary session. An unauthenticated post gets
  `401` with a JSON body, never a redirect to an HTML login page.
- **Org scoping** is resolved from the session before the body is read. The
  organisation on the session is the only organisation that exists for the
  request; a project belonging to another one answers "Project not found".
- **`X-PoolForge-Anchor-X` / `-Y`** place the benchmark tap on the drawing, in
  feet right of and back from the drawing origin. Both default to `0`, which
  puts the benchmark at the drawing origin.
- **Body limit** is 24MB. A `Content-Length` above it is refused immediately;
  a missing or lying one changes nothing, because the body is read through a
  counting reader that cancels the stream the moment it passes the cap.

### Response

`201` on success:

```json
{
  "ok": true,
  "data": {
    "captureId": "cap_9f2c1a7b4e6d8035bb11c4e7a90d2f16",
    "projectId": "clx...",
    "cols": 300,
    "rows": 200,
    "cells": 60000,
    "measuredCells": 47213,
    "shotCount": 65,
    "keptFixed": 1,
    "replacedPoints": 3,
    "maxErrorFt": 0.412,
    "datumFt": 7.5,
    "coverage": {
      "measuredPct": 78.7,
      "areaSqft": 6458.3,
      "measuredAreaSqft": 5082.6,
      "gapAreaSqft": 1375.7,
      "largestGapSqft": 980.2,
      "complete": false,
      "headline": "79% walked",
      "caveat": "21% of the captured area was never walked (1,376 sq ft, the largest hole 980 sq ft). The ground there is interpolated from what surrounds it, not measured, so the earthwork over it is an estimate."
    }
  }
}
```

Failures are `{ "ok": false, "error": "<one sentence>" }`. The sentence is
written for a person standing in a yard and is safe to show verbatim. It never
contains a parser message, a field path, a stack frame or any part of the
uploaded document.

| Status | Means | What the app should do |
|---|---|---|
| `201` | Ingested. | Show the coverage summary. |
| `400` | Malformed, inconsistent, or nothing measured. | Do not retry unchanged. Show the sentence. |
| `401` | Not signed in. | Re-authenticate, then retry. |
| `409` | `contractVersion` this server does not read. | Tell the user to update the app. Do not retry. |
| `413` | Body over the cap. | Re-capture at a coarser `cellSizeM`. Do not retry unchanged. |
| `5xx` | Ours. | Retry with the same `captureId` (see §8). |

---

## 4. The document

```jsonc
{
  "contractVersion": 1,
  "captureId": "cap_9f2c1a7b4e6d8035bb11c4e7a90d2f16",
  "capturedAt": "2026-08-22T15:04:05.000Z",

  "device": {                       // optional
    "model": "iPhone 17 Pro",
    "osVersion": "26.1",
    "appVersion": "1.0.3"
  },

  "frame": {
    "originEastM": -1.5,
    "originNorthM": 0.0,
    "cellSizeM": 0.1,
    "cols": 300,
    "rows": 200,
    "headingDeg": 274.5              // optional
  },

  "benchmark": {
    "label": "top of slab",          // optional
    "eastM": 0.0,
    "northM": 0.0,
    "arElevationM": 1.42,
    "siteElevationFt": 0
  },

  "encoding": "base64",
  "elevations": "...",
  "coverage": "..."
}
```

### `contractVersion`, required, must be `1`

Bumped when a field changes meaning, never when a field is added. A version this
server does not read is answered `409` with "update the app", not `400`, so the
phone can tell a protocol mismatch from a bad payload.

### `captureId`, required: `cap_` plus 32 lowercase hex characters

The phone's own id for this walk. **Generate it once, when the walk starts, and
reuse it on every retry of the same walk.** See §8.

### `capturedAt`, required: ISO 8601 with an offset

`2026-08-22T15:04:05.000Z` or `2026-08-22T11:04:05.000-04:00`. When the walk
finished.

### `device`, optional

`model`, `osVersion`, `appVersion`, each 1 to 60 characters. Recorded for
support. Nothing branches on it.

### `frame`, required

The capture frame is gravity-aligned, right-handed on the ground plane, with
**+east to the right and +north away from the operator's start**. Its origin is
wherever the ARKit session started, which means nothing to anybody; everything
is resolved against the benchmark.

| Field | Type | Range | Meaning |
|---|---|---|---|
| `originEastM` | number | ±200 | East coordinate of the **centre** of cell (0, 0). |
| `originNorthM` | number | ±200 | North coordinate of the centre of cell (0, 0). |
| `cellSizeM` | number | 0.02 to 1 | Cell pitch. 0.1 is the expected value. |
| `cols` | integer | 2 to 250,000 | Cells across, in +east. |
| `rows` | integer | 2 to 250,000 | Cells down, in +north. |
| `headingDeg` | number | 0 to 360 | Optional. Compass bearing of the frame's +north axis. |

`cols * rows` must not exceed **250,000**. A 30 by 20 metre yard at 10cm is
60,000, which is the size the whole pipeline is designed and tested around.

`headingDeg` is **recorded, not applied**. See §11.

### `benchmark`, required

The tap that turns ARKit's arbitrary origin into a height on this site.

| Field | Type | Range | Meaning |
|---|---|---|---|
| `label` | string | 1 to 60 chars, optional | What the builder tapped: "top of slab", "door sill". |
| `eastM` | number | ±200 | Where they tapped, in the capture frame. |
| `northM` | number | ±200 | |
| `arElevationM` | number | ±100 | What ARKit thought the ground height was at that spot. |
| `siteElevationFt` | number | ±1000 | What it actually is, **in feet** on this site's datum. |

Ask for the tap. Do not guess it, and do not upload without it: a capture with
no benchmark is a shape with no height.

`siteElevationFt` should default to `0` in the UI, which is what a builder means
when they tap the house pad and call it zero.

### `encoding`, required: `"json"` or `"base64"`

Which form `elevations` and `coverage` take. Both decode to the same
heightfield, and a property test asserts it.

Use `"json"` for a first implementation and for debugging. Use `"base64"` in
production: a 60,000 cell yard is about 1.4MB as JSON and about 320KB as base64.

### `elevations`, required

Row-major, `cols * rows` values, metres in the capture frame (ARKit's y).

Index of cell `(col, row)` is `row * cols + col`.

- `"json"`: an array of numbers.
- `"base64"`: base64 of `cols * rows` **little-endian IEEE-754 float32** values,
  4 bytes each, no header and no padding. Byte length must be exactly
  `cols * rows * 4`.

A cell whose coverage says it was never walked (§6) **may carry anything**. The
server does not read it, now or ever; it is replaced with the datum on ingest so
a stray float cannot reach the surface through a later code path that forgot to
check the mask. Send `0`, send `NaN`, send whatever is cheapest.

A cell that **was** walked must carry a finite value within ±100 metres, or the
whole capture is refused as inconsistent.

### `coverage`, required

Row-major, `cols * rows` values, same indexing as `elevations`.

- `"json"`: an array of numbers from `0` to `1` inclusive. A value outside that
  range refuses the capture; it is never clamped, because quietly rounding 1.4
  down to 1 turns a client bug into ground the app claims somebody walked.
- `"base64"`: base64 of `cols * rows` **unsigned bytes**, one per cell, where
  byte `n` means `n / 255`. Byte length must be exactly `cols * rows`.

The value means: **how much of that cell got a LiDAR return, weighted by
ARKit's own confidence.** Zero means the person never walked it.

Base64 is the safer choice here as well as the smaller one, because a byte
cannot be out of range.

---

## 5. The datum

Every height in Pool Forge is absolute: a survey shot is a real height, and the
datum is the height of ground nobody measured. That invariant is load-bearing
and is enforced by property tests that predate this feature.

ARKit's `y` is metres above wherever the session happened to start. The server
converts:

```
elevationFt(cell) = (elevationsM[cell] - benchmark.arElevationM) * 3.280839895…
                  + benchmark.siteElevationFt
```

A shift, never a scale, so the shape of the ground cannot change at this step.
`benchmark.siteElevationFt` becomes the surface's `baseElevationFt`, which is
precisely "the height of ground nobody measured".

The benchmark also becomes a survey shot in its own right, marked `fixed`: it is
the one height on site that is not an estimate, and re-benchmarking is a new
capture rather than an edit.

---

## 6. What counts as measured

A cell is **measured** when its coverage is at or above `0.35`
(`MEASURED_COVERAGE_MIN`). Not 1, and not 0: ARKit returns partial hits at the
edge of the cone and in bright sun, and a cell that got a third of its area back
is a real measurement with a real height. Below the threshold it is ground
nobody walked, and every number derived from it has to say so.

Consequences the iOS app should know about:

- A capture where **no** cell reaches the threshold is refused with
  "every cell came back empty". Do not upload a walk that failed; the live
  coverage display should have already told the user.
- Only measured cells can become survey shots. A shot is a claim that somebody
  stood there.
- The live "crossed off" display on the phone should use the same threshold, so
  the person is not told they are done and then told they are not.

---

## 7. What the server does with it

1. **Validates** the whole document. Version first, so a v2 phone is told to
   update rather than told about a literal.
2. **Converts** to canvas inches and feet on the datum, once, at the boundary.
3. **Places** it: the benchmark lands at the anchor from the headers.
4. **Decimates** the measured cells to representative survey shots. It is
   error-driven, not a stride: it starts from the extremes of position and
   elevation, and repeatedly promotes the measured cell the current surface gets
   most wrong, until the worst remaining error is under 0.05 ft or the budget of
   64 shots is spent. A stride would sample a drainage swale wherever it
   happened to land and miss the bottom of it, which is the part that decides
   the dig.
5. **Writes** those shots onto the project's existing ground surface. Points
   marked `fixed` on the previous surface survive; typed guesses are superseded,
   because two surveys of one yard averaged together is a third yard that
   matches neither. The finished (design) surface is never touched.
6. **Stores** the full heightfield and mask in `SiteCapture`, keyed on
   `(orgId, captureId)`.
7. **Reports** coverage, which is returned and also carried on the surface so
   the panel that prints the cut and fill can say how much of that ground
   anybody stood on.

The decimated surface is ordinary spot elevations, so everything already built
on top of the grade model (the terrain mesh, the section profile, the steepest
slope, the cut and fill, and the panel a builder types into) works on a walked
site with no special case.

Because inverse distance weighting is a smoother, a narrow trench or the face of
a slab is rounded off rather than reproduced exactly. The size of that
disagreement is measured against the surface that actually shipped and returned
as `maxErrorFt`. It is published rather than hidden.

---

## 8. Retries and idempotency

`captureId` is the idempotency key, unique per organisation.

- Generate it **once per walk**, not once per upload attempt.
- On a `5xx` or a dropped connection, retry with the same id. The server
  upserts, so the yard is recorded once.
- A genuinely new walk of the same yard gets a **new** id, and supersedes the
  previous surface. The previous `SiteCapture` row is left alone.

The staged upload reference the route hands the command is single-use, expires
in two minutes, and is refused outside the organisation it was raised in. It is
an internal detail; the phone never sees it.

---

## 9. Limits, in one place

| Limit | Value | Constant |
|---|---|---|
| Contract version | `1` | `CAPTURE_CONTRACT_VERSION` |
| Cells per capture | 250,000 | `MAX_CAPTURE_CELLS` |
| Cell size | 0.02m to 1m | `MIN_CELL_SIZE_M`, `MAX_CELL_SIZE_M` |
| Frame extent from benchmark | ±200m | `MAX_FRAME_EXTENT_M` |
| Elevation from ARKit origin | ±100m | `MAX_ELEVATION_M` |
| Coverage counted as measured | ≥ 0.35 | `MEASURED_COVERAGE_MIN` |
| Request body | 24MB | `MAX_CAPTURE_BODY_BYTES` |
| Survey shots left behind | 64 | `DEFAULT_MAX_SHOTS` |
| Decimation tolerance | 0.05 ft | `DEFAULT_TOLERANCE_FT` |

---

## 10. A complete tiny example

Two cells across, two down, 50cm spacing. The near-left cell was never walked.

```json
{
  "contractVersion": 1,
  "captureId": "cap_000102030405060708090a0b0c0d0e0f",
  "capturedAt": "2026-08-22T15:04:05.000Z",
  "frame": {
    "originEastM": 0,
    "originNorthM": 0,
    "cellSizeM": 0.5,
    "cols": 2,
    "rows": 2
  },
  "benchmark": {
    "label": "top of slab",
    "eastM": 0,
    "northM": 0,
    "arElevationM": 1.4,
    "siteElevationFt": 0
  },
  "encoding": "json",
  "elevations": [0, 1.4, 1.1, 1.0],
  "coverage": [0, 1, 1, 0.8]
}
```

Reading it: cell (0,0) is at east 0, north 0 and was never walked, so its `0`
is ignored and it is treated as datum. Cell (1,0) is at east 0.5m, north 0, and
its ARKit height of 1.4m equals the benchmark's, so it sits at 0 ft. Cell (0,1)
is at north 0.5m and 0.3m lower, so it sits at −0.98 ft. Cell (1,1) got 80% of
its area back, which is over the threshold, and sits at −1.31 ft.

---

## 11. Deliberately left to the iOS side

These are decisions, not omissions.

- **Rotation onto the plan.** v1 ingests axis-aligned: +east becomes +x on the
  drawing, +north becomes +y. `headingDeg` is carried and stored but not
  applied, because rotating a capture to a compass bearing under a plan that is
  already square to the street would move the yard nobody asked to move.
  Until an alignment step exists, the app should ask the operator to start the
  walk along a known edge (the house wall) so the frame lands square.
- **The live coverage display.** Deciding when the person is done is a phone
  problem, and it is most of the product. The threshold in §6 is the one number
  the two sides have to agree on.
- **Filling holes on the phone.** Do not. An interpolated cell uploaded with
  coverage 1 is a lie the server cannot detect and the whole feature is built to
  prevent. Upload holes as holes.
- **Downsampling on the phone.** Fine, and preferred over a 413. Downsample by
  averaging the elevations and averaging the coverage; do not take a max of the
  coverage.
- **Photos, meshes, textures, object recognition.** Not part of this contract.
- **Multiple benchmarks and closing a loop on drift.** ARKit drifts over a long
  walk and one benchmark cannot correct it. v1 accepts the drift; a future
  version may take several taps and fit them.

---

## 12. Changing this contract

- Adding an **optional** field: no version bump. Old phones keep working.
- Adding a **required** field, changing a unit, changing what a field means, or
  changing the row-major order: bump `CAPTURE_CONTRACT_VERSION`, and keep
  reading the old version until the last phone is off it.
- Every change lands with its tests in the same commit:
  `src/test/property/capture.property.test.ts` for the invariants,
  `src/test/unit/capture/` for the boundary and the size.

---

## Appendix A: what Apple actually exposes (added 2026-08-30)

Reference for whoever works on `ios/PoolForgeCapture`. Apple never exposes the
raw sensor: no photon or SPAD returns, no access to the emitter's dot pattern.
Everything below is a **fused** depth product (LiDAR plus the wide camera plus
an ML model), which is why §6's coverage rule cannot be replaced by "trust the
sensor".

### A.1 ARKit, the path this app is on

```swift
let cfg = ARWorldTrackingConfiguration()
guard ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else { ... }
cfg.frameSemantics.insert(.sceneDepth)
cfg.sceneReconstruction = .mesh
```

`CaptureController.swift:19-63` already gates exactly this way. Never gate on a
device model string; gate on `supportsFrameSemantics` / `supportsSceneReconstruction`.

| API | Type | Notes |
|---|---|---|
| `ARFrame.sceneDepth` | `ARDepthData` | what `FrameRecorder.appendDepth` writes as PFD1 |
| `ARDepthData.depthMap` | `CVPixelBuffer`, `DepthFloat32` | **metres**, 256x192, at session frame rate (60 Hz) |
| `ARDepthData.confidenceMap` | `CVPixelBuffer`, `UInt8` | `ARConfidenceLevel` low / medium / high |
| `ARFrame.smoothedSceneDepth` | `ARDepthData` | temporally smoothed, less flicker, more lag. Not currently requested |
| `ARFrame.camera.intrinsics` + `.transform` | `simd` matrices | what unprojects depth into a point cloud; both already serialized into the pose JSONL |
| `ARMeshAnchor` / `ARMeshGeometry` | vertices, normals, faces | from `sceneReconstruction`; `.meshWithClassification` adds per-face wall / floor / ceiling / table / seat / window / door |

256x192 is ARKit's output resolution, not the sensor's grid. The emitter fires
on the order of a few hundred points; everything between them is inferred. That
inference is invisible in `depthMap` and only partly visible in `confidenceMap`,
which is the whole argument for §1's coverage mask.

Practical range is about five metres and degrades badly in direct sun, which is
already assumed by §1's lawnmower walking pattern.

### A.2 AVFoundation, if capture ever needs to run outside an AR session

- `AVCaptureDevice.DeviceType.builtInLiDARDepthCamera` (iOS 15.4+)
- `AVCaptureDepthDataOutput` yields `AVDepthData`:
  - `depthDataMap` as `DepthFloat16` / `DepthFloat32` or disparity
  - `depthDataAccuracy == .absolute` on LiDAR, meaning true metric scale.
    Stereo-derived depth reports `.relative` and is worthless for our purposes
  - `cameraCalibrationData`: intrinsic matrix, extrinsics, lens distortion
    lookup tables
  - resolutions come from `device.activeFormat.supportedDepthDataFormats`,
    typically 320x240 up to 640x480, so higher spatial resolution than ARKit's
    256x192 but with no pose attached
- `AVCapturePhotoOutput.isDepthDataDeliveryEnabled` gives `AVCapturePhoto.depthData`,
  also written into HEIC as an auxiliary image

The tradeoff is stark: AVFoundation gives a better depth map and no world
tracking. Since our artefact is a heightfield stitched across a walk, pose is
worth more than pixels, so ARKit stays the right choice.

### A.3 Higher-level frameworks built on the same sensor

- **RoomPlan** (iOS 16+): `RoomCaptureSession` produces `CapturedRoom` with
  walls, doors, windows, openings and categorized objects; `CapturedStructure`
  (iOS 17+) merges rooms; exports USDZ. Indoor-only by design, so not a fit for
  a backyard, but it is the API shape to study if we ever do screen enclosures
  or lanai interiors.
- **Object Capture**: `ObjectCaptureSession` (iOS 17+) and RealityKit
  `PhotogrammetrySession`. LiDAR supplies scale and gravity, so output is
  metrically correct rather than unit-less. Relevant to the deferred "meshes and
  textures" item in §11.
- **RealityKit scene understanding**:
  `arView.environment.sceneUnderstanding.options = [.occlusion, .physics, .collision]`,
  plus `.personSegmentationWithDepth` for people occlusion. Relevant only if we
  ship an in-yard AR preview.

### A.4 Device gating

Rear LiDAR ships on iPhone Pro and Pro Max from the 12 Pro onward, iPad Pro from
2020 onward, and iPad Air 5th generation. Non-Pro iPhones have never had it.
The app must stay useful on a device without it: `sceneDepth` is absent, so the
capture degrades to visual-inertial odometry with no measured ground, and every
resulting cell should be uploaded with coverage 0 rather than a guess. See §11,
"Filling holes on the phone. Do not."
