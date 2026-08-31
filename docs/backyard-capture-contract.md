# Backyard capture bundle contract, v1

The wire contract between the consumer capture iOS app and Pool Forge's
ingestion API. This is the Wave 0 document: the iOS app and the backend are
built against it in parallel, and where code and this doc disagree, the Zod
schemas in `src/modules/capture-bundle/contract.ts` are the arbiter.

This is a **different contract** from `lidar-capture-contract.md`. That one
uploads a finished heightfield computed on the phone. This one uploads the raw
capture (RGB frames, ARKit poses, opportunistic depth) so the cloud can run
photogrammetry/2DGS reconstruction. The two coexist; a later app version may
send both.

Background and rationale: `docs/3d-asset-pipeline-research.md`, Track 3.

---

## 1. The flow

1. **Address**: the user types an address (Places Autocomplete proxy) or taps
   "use current location" (reverse-geocode proxy). Either way the app ends up
   with a Google place: formatted address, lat/lng.
2. **Site confirm**: the app shows the satellite static map with the Solar API
   building footprint overlaid, and the user confirms or nudges it (same
   pattern as Pool Forge site import).
3. **Lap plan**: the app offsets the footprint/parcel edge to a capture path
   ~8-10 ft off surfaces, with waypoint stations at corners and mid-spans.
4. **Capture**: ARKit world tracking. AR waypoint rings, coverage paint on the
   ground, a return-to-start final leg. Recorder writes frames, poses, and
   depth (when the device has it) into chunks on disk.
5. **Upload**: chunks upload via GCS resumable sessions starting mid-capture;
   each verified chunk is deleted locally. The phone never accumulates more
   than the in-flight tail of one walk.
6. **Finalize**: the app declares the manifest; the server checks every seq is
   present and verified. Reconstruction is a later, separate worker; this
   contract ends at "bundle complete in GCS".

## 2. Device support

- **LiDAR is optional everywhere.** The dev phone is an iPhone 13 mini (no
  LiDAR). Gate with `ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)`
  and `supportsSceneReconstruction(.mesh)`, never on model strings.
- Without LiDAR: RGB frames + ARKit poses + plane-raycast coverage paint
  (raycast `.estimatedPlane` against the ground). This is the primary path.
- With LiDAR (Pro devices): additionally record `sceneDepth` (256x192
  DepthFloat32 + confidence) as `depth` chunks, and scene-reconstruction
  meshes may improve the live coverage UI. Depth is a prior for the cloud
  solver, never required.
- iOS 17+, ARKit world tracking, 60 Hz session; frames are *sampled* at
  ~2 fps for recording.

## 3. Auth

Bearer tokens minted by an authenticated Pool Forge web session:

- `POST /api/mobile/tokens` (cookie-authed, existing `requireSession`) mints
  `pfc_<40 hex>`, shown once; SHA-256 of the token is stored. The app keeps it
  in the Keychain and sends `Authorization: Bearer pfc_...` on every call.
- Tokens carry `orgId` + `userId`; every ledger row and GCS object path is
  org-scoped. Revocation = setting `revoked_at`.

## 4. Endpoints

All JSON, all Zod-validated, all bearer-authed unless noted. Mounted under
`/api/mobile/` (a mobile surface, deliberately separate from the web app's
routes). Every route replicates the audit-write pattern used by
`/api/capture/heightfield`.

| Route | Purpose |
|---|---|
| `POST /api/mobile/tokens` | Mint a capture token (cookie session, not bearer) |
| `GET  /api/mobile/site/autocomplete?q=&session=` | Proxy of Places Autocomplete (reuses `src/modules/site/geo/google.ts`) |
| `GET  /api/mobile/site/place?placeId=&session=` | Place lat/lng + `buildingInsights` footprint + static map URL |
| `GET  /api/mobile/site/reverse?lat=&lng=` | Reverse geocode current location to an address (new helper in `geo/google.ts`) |
| `GET  /api/mobile/site/staticmap?lat=&lng=&zoom=&w=&h=` | Authenticated satellite image proxy (the actual bitmap) |
| `POST /api/mobile/capture/sessions` | Open a capture session |
| `POST /api/mobile/capture/sessions/:id/chunks` | Register a chunk, get a GCS resumable upload URI |
| `POST /api/mobile/capture/sessions/:id/chunks/:seq/complete` | Server verifies the object (existence + exact size), marks verified; the ack tells the phone it may delete |
| `POST /api/mobile/capture/sessions/:id/finalize` | Declare the manifest; server checks contiguity and closes the session |

The `staticMapUrl` that `site/place` returns is a **relative path** to
`/api/mobile/site/staticmap` (fetched with the same bearer), never Google's
own Static Maps URL: that URL embeds the server's API key, and the standing
rule in `src/modules/site/geo/google.ts` is that it never reaches a client.

Audit: the mutating routes (`tokens`, `sessions`, `chunks`, `complete`,
`finalize`) each write the same `CommandAuditLog` row shape the heightfield
route writes (source `API`; the minted token itself never appears in a row).
The read-only site proxies do not audit - the audited action is the capture
session a person opens, not every autocomplete keystroke on the way there,
matching the web app where `/api/site/autocomplete` is not a command either.

### Session create

```jsonc
// request
{
  "contractVersion": 1,
  "sessionId": "bcs_<32 hex>",        // client-generated, idempotent retry key
  "address": "123 Main St, ...",
  "placeId": "ChIJ...",                // optional
  "lat": 33.1, "lng": -96.8,
  "footprint": [[lat, lng], ...],      // optional, as confirmed/nudged
  "device": { "model": "iPhone14,4", "osVersion": "17.5", "appVersion": "0.1.0", "hasLidar": false }
}
// response
{ "ok": true, "sessionId": "bcs_..." }
```

### Chunk register

```jsonc
// request
{ "seq": 12, "kind": "frames", "bytes": 24117248, "sha256": "<64 hex>" }
// response
{ "ok": true, "uploadUrl": "https://storage.googleapis.com/upload/...uploadId=..." }
```

`uploadUrl` is a **GCS resumable upload session URI** initiated server-side
(works under Cloud Run's service identity and local ADC, no SA key, which is
org-blocked). The phone PUTs bytes to it directly, with byte-range resume on
failure. Registering the same `(sessionId, seq)` again before verification
returns a fresh URI (retry); after verification it returns 409.

Object path: `captures/<orgId>/<sessionId>/<seq>-<kind>.bin` in the
`CAPTURE_BUNDLE_BUCKET` bucket (same GCP project as Pool Forge).

The meta chunk's placement is enforced at register time as well as at
finalize: registering seq 0 with any other kind, or `meta` at any other seq,
is a 400 - a broken recorder should hear about it while the walk is still
happening.

### Chunk complete

The ack checks **existence and exact size** against the registered
declaration. It does not re-hash content: the object is not downloaded, and
GCS's crc32c/md5 describe what GCS received with nothing client-declared to
compare against. The declared sha256 lives in the ledger (and as object
metadata), and the reconstruction worker - the first thing that reads the
bytes - verifies content against it before trusting a frame. `ok: true,
verified: true` is the phone's licence to delete its local copy.

### Finalize

```jsonc
// request - the manifest is one number, because seq is global and contiguous
{ "contractVersion": 1, "maxSeq": 41 }
// response, whole
{ "ok": true, "sessionId": "bcs_...", "chunkCount": 42, "finalizedAt": "..." }
// response, not whole (409)
{ "ok": false, "error": "The bundle is missing 2 chunks. ...", "missingSeqs": [7, 30] }
```

Caps, from `src/modules/capture-bundle/contract.ts`: a registered chunk
declares at most 28MB (`MAX_CHUNK_BYTES`, the ~24MB target plus one frame of
margin), and a session holds at most 512 chunks (`MAX_CHUNKS_PER_SESSION`).

## 5. Chunk formats

Chunks target ~24 MB or ~50 frames, whichever first. `seq` is global and
monotonic across kinds; the manifest is the ordered list of all seqs.

- **`frames`**: length-prefixed binary, magic `PFC1`, then per frame:
  `u32 frameIndex, f64 timestampS, u32 jpegBytes, <jpeg>`. JPEGs are the
  ARKit `capturedImage` at full camera resolution, quality ~0.8.
- **`poses`**: JSONL, one line per recorded frame:
  `{ "i": frameIndex, "t": timestampS, "transform": [16 floats, column-major], "intrinsics": [9 floats], "trackingState": "normal|limited", "gravity": [3 floats] }`
- **`depth`** (LiDAR devices only): magic `PFD1`, per frame:
  `u32 frameIndex, f64 timestampS, u32 zlibDepthBytes, <zlib Float32 256x192>, u32 zlibConfBytes, <zlib UInt8 256x192>`.
- **`meta`** (exactly one, seq 0): JSON: session info, lap plan polygon and
  stations (local meters), footprint in both lat/lng and the session's local
  frame, benchmark tap if taken, capture settings, app/device versions.

All multi-byte integers little-endian. Every chunk's SHA-256 is declared at
register time and verifiable after upload.

## 6. The ledger (Turso)

Server-side state lives in Turso (libSQL) via `@libsql/client`, env
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`, with a `file:` URL fallback so dev
and CI run with zero setup. The phone mirrors the chunk table locally in
SQLite, which is what makes the upload queue survive kills and offline aisles.

```sql
CREATE TABLE capture_tokens (
  token_hash TEXT PRIMARY KEY,          -- sha256 hex of pfc_ token
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE capture_sessions (
  session_id TEXT PRIMARY KEY,          -- bcs_<32 hex>
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,
  place_id TEXT,
  lat REAL NOT NULL, lng REAL NOT NULL,
  footprint_json TEXT,
  device_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- open | finalized | abandoned
  created_at TEXT NOT NULL,
  finalized_at TEXT
);
CREATE TABLE capture_chunks (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,                   -- frames | poses | depth | meta
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | verified
  gcs_object TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  verified_at TEXT,
  PRIMARY KEY (session_id, seq)
);
```

Finalize succeeds only when seqs `0..maxSeq` are all `verified` and seq 0 is
`meta`; otherwise it answers with the missing seqs so the app knows exactly
what to re-upload.

## 7. iOS app shape

Lives in `ios/PoolForgeCapture/`, XcodeGen project (`project.yml`), SwiftUI,
iOS 17 target. Modules:

- `Site/`: address search + current-location, site confirm map with footprint
  overlay and nudge.
- `Lap/`: pure-Swift lap planner (polygon offset ~2.7 m with mitered corners,
  stations at corners and >8 m mid-spans, return-to-start leg). Unit tested;
  no ARKit import.
- `Capture/`: ARSession wrapper, guidance overlays (waypoint rings, coverage
  paint, too-close/too-far reticle), frame sampler, chunk writer. Capability
  gating per section 2.
- `Upload/`: SQLite-backed queue, background `URLSession` resumable PUTs,
  verify-ack-delete loop, works across app kills.
- `API/`: typed client for the endpoints above, token in Keychain.

Simulator cannot run ARKit; the build gate is "compiles for the simulator and
all non-AR unit tests pass", with capture testable only on device.

## 8. Env vars

Added to `.env.example` and deploy scripts in the same commit that introduces
them (repo rule):

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (fallback: `file:.data/capture-ledger.db`)
- `CAPTURE_BUNDLE_BUCKET` (GCS bucket, same project as Pool Forge)

## 9. Out of scope for v1

Cloud reconstruction (COLMAP + 2DGS + ground filter + heightfield), the
on-device heightfield of `lidar-capture-contract.md`, and rendering the splat
in the editor. The bundle format above is designed so the reconstruction
worker can be built later without touching the app again.
