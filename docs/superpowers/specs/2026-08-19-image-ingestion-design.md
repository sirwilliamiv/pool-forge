# Image Ingestion Pipeline — Design

> **Status:** approved 2026-08-19. Implementation runs as Wave I (I0 contract, then I1–I5 parallel, then I6 integration).
> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. This spec is the contract; each track owns a disjoint file set.

## Why

`docs/competitive-analysis.md:85` records the market gap: across 21 competitors, AI is **uncontested** in 2026. "Photo→design, AI estimating, auto-camera all uncontested." MyPoolDesigner.ai produces static AI images with no geometry behind them; every incumbent imports only DWG/GIS/DXF and requires a human to trace.

Pool Forge already has the pieces that make ingestion worth more than a demo: a measurement engine, a price book, a validation engine, and four document exports. An image that becomes a *measured* project becomes a priced quote in the same session. That is the whole thesis.

## Scope

Three input paths the user named, plus two the pipeline has to distinguish anyway:

| Kind | What it is | Geometry value | Primary payload |
|---|---|---|---|
| `SKETCH` | Graph paper, napkin, dimensioned hand drawing | **High** | Footprint polygon + dimensions + scale |
| `SITE_PLAN` | Surveyor plat, plot plan, scanned sitemap (image or PDF) | **High** | Property boundary, setbacks, house footprint, scale bar |
| `CONCEPT_RENDER` | ChatGPT / Midjourney / Pinterest inspiration | **None** | Design intent: shape family, features, materials, style. **Never dimensions.** |
| `SITE_PHOTO` | Real backyard photo from the customer | Low | Existing conditions, feature detection, render backdrop |
| `SCREENSHOT` | Competitor software export, satellite capture | Medium | Whatever is legible; treated as `SITE_PLAN` when a scale bar is found |

Out of scope for v1, named so nobody drifts into them: perspective rectification of oblique photos, DWG/DXF parsing, multi-page PDF sets beyond page 1, video, LiDAR.

## Architectural decision: model for semantics, code for precision

Three options were weighed.

**Model-only geometry** (ask Gemini for the polygon and the numbers, trust it) ships fastest and fails unrecoverably. A pool quote is a number a customer signs; a hallucinated 34ft that should be 32ft is a five-figure error with no audit trail.

**Model + OpenCV wasm** buys real contour tracing and perspective rectification at roughly 9MB of wasm and a large complexity budget.

**Chosen: model for semantics, code for precision.** The model does what a human eye does and a regex cannot: recognise the shape family, read the handwritten `1 sq = 1 ft`, find the text on a dimension line, name the deck material, list the features. Deterministic TypeScript produces every number that reaches a quote:

- Grid pitch by autocorrelation over row and column intensity projections.
- Douglas-Peucker simplification of the model's coarse polygon.
- Axis snapping (edges within 3° of horizontal/vertical are made exact).
- Grid-intersection vertex snapping when a grid was detected.
- Cross-checking two or more labeled dimensions against each other; disagreement over 5% downgrades scale confidence and forces manual calibration.

Consequence: the entire precision layer is pure functions with no model calls, no network, and no database, so it is unit-testable against fixtures from day one and one track can build it in complete isolation.

OpenCV-based perspective rectification stays on the shelf as a named follow-on scoped to `SITE_PHOTO` only.

## Pipeline

```
INGEST     upload → BlobStore → SourceImage row
           sha256 dedupe · magic-byte sniff · EXIF/GPS strip · downscale to 1568px long edge · thumbnail
CLASSIFY   one cheap vision call → { kind, rotationDeg, qualityFlags[] }
EXTRACT    kind-specific vision call → typed payload (Zod validate + one-shot repair)
CALIBRATE  resolve pixelsPerInch: grid | labeled-dimension | scale-bar | manual 2-point
TRANSLATE  payload + scale → DesignIntent (unit-normalized, per-field provenance)
REVIEW     wizard: image with overlays beside editable fields, confidence badges
APPLY      command batch → shapes + poolFields + notes; one undo entry, one audit row
```

Every stage writes an `ImageAnalysis` row keyed on `(sourceImageId, stage, extractorVersion)`. Consequences: re-runs are cached and free, prompt changes are replayable over the whole corpus, failures are debuggable after the fact, and the rows accumulate into an eval corpus at no extra cost.

Stages CLASSIFY through TRANSLATE are idempotent and server-side. Nothing is ever auto-applied to a project without passing through REVIEW.

## The contract: `DesignIntent` v1

Lives at `src/modules/imports/intent.ts`. Five extractors collapse into it; the review UI and the command batch read only it. This is the seam that lets the tracks run in parallel.

Deliberately **flat**: no recursion, no top-level discriminated unions, confidence as a flat `Record<dottedPath, number>` rather than nested beside every node. Per the global note in `CLAUDE.md`, Gemini's JSON-Schema subset cannot express recursive or polymorphic shapes and silently emits `{}` for the affected fields, and tests that mock the model do not catch it. So the extractors do **not** pass `responseSchema`; they validate with Zod and do one repair round-trip on failure, logging drops at `warn` with the raw response and the rejection reason.

```ts
DesignIntentV1 {
  version: 1
  sourceImageIds: string[]
  pool: {
    footprint: { points: { x: number; y: number }[] } | null   // inches, intent-frame origin top-left
    shapeFamily: 'rectangle'|'oval'|'kidney'|'grecian'|'roman'|'lagoon'|'lshape'|'freeform'|'unknown'
    lengthFt, widthFt, depthShallowFt, depthDeepFt: number | null
  }
  features: { stencilId, label, lengthFt, widthFt, count, x, y }[]
  deck: { footprint, material: 'concrete'|'paver'|'travertine'|'grass'|'unknown', widthFt }
  enclosure: { present: boolean, kind: 'screen'|'lanai'|'none', heightFt, footprint }
  site: { propertyBoundary, houseFootprint, setbacksFt, northDeg, notes: string[] }
  materials: { interiorFinish, copingMaterial, tileBand, deckMaterial }
  scale: { pixelsPerInch: number | null, method: 'grid'|'labeled-dimension'|'scale-bar'|'manual', confidence }
  fieldConfidence: Record<string, number>    // dotted path → 0..1
  warnings: string[]
}
```

**Two hard gates, enforced in `import.intent.apply`, not in the UI:**

1. `scale.pixelsPerInch === null` blocks applying any footprint or any derived dimension. The user gets the calibration tool instead of a wrong pool.
2. Any field whose `fieldConfidence` is below `0.6` must be explicitly touched by a human before it applies. Confidence bands: green ≥ 0.85, amber 0.6–0.85, red < 0.6.

## Storage, and a live bug it fixes

`src/modules/editor/state/surveyStore.ts` holds `imageDataUrl` and `persistence.ts` writes it into `Drawing.rootJson`. A single 12MP customer photo base64s to roughly 16MB inside a JSON column, on every save and every load. That does not survive contact with the feature being built here.

New `src/modules/storage/` exposes a `BlobStore` interface with a local-disk driver writing under `.data/blobs/` (gitignored), read back through an org-scoped authenticated route. A GCS driver lands with Wave 2 T8. Bytes never go in Postgres and data URLs never go in `rootJson`. I0 migrates existing survey data URLs to `SourceImage` references.

New models (all org-scoped, all with a migration in the same commit):

- **`SourceImage`** — `orgId`, `projectId?`, `kind`, `storageKey`, `mimeType`, `bytes`, `sha256`, `widthPx`, `heightPx`, `uploadedBy`, `origin: BUILDER | CUSTOMER_INTAKE`
- **`ImageAnalysis`** — `sourceImageId`, `stage`, `extractorVersion`, `model`, `promptHash`, `rawJson`, `parsedJson`, `tokensIn`, `tokensOut`, `latencyMs`, `status`, `errorRef`
- **`ImportSession`** — `orgId`, `projectId?`, `status`, `designIntentJson`, `appliedAt`, `appliedCommandIds` — the reviewable unit spanning N images
- **`IntakeLink`** / **`IntakeSubmission`** — the public funnel

## Command registry

Non-negotiable per `CLAUDE.md`: no UI event handler touches Prisma. New `import` category added to `CommandCategory` in `registry.ts` and to `init.ts`, with seven real `execute` bodies, no stubs:

| Command | Notes |
|---|---|
| `import.session.create` | |
| `import.image.upload` | Bytes arrive over a route; the route dispatches the command |
| `import.image.analyze` | Idempotent on `(sourceImageId, extractorVersion)` |
| `import.calibrate.set` | Manual 2-point fallback |
| `import.intent.patch` | Every human edit, so the audit log shows what the model got wrong |
| `import.intent.apply` | Transactional; emits child shape commands; coalesces to one undo entry |
| `import.session.discard` | |

`import.intent.patch` writing an audit row per human correction is what turns ordinary usage into labelled training signal for prompt iteration.

## Review wizard

Route `/projects/[id]/import`, a real route rather than local view state (per the global Next.js note: inline view switching bypasses route-level data loading). Left pane is the image with toggleable overlays: detected polygon, dimension lines, grid, calibration points. Right pane is the editable intent with confidence badges. Footer is an apply-diff preview naming exactly which shapes will be created before anything is created.

## Customer intake

Route `/intake/[token]`, tokens minted per org in settings, reusing the existing `/share/[token]` pattern.

- Caps: 8 images, 15MB each, `image/*` plus `application/pdf`.
- **Magic-byte sniff, not header trust.** Filenames are never echoed back.
- EXIF stripped at ingest, before storage and before the model call. Customer backyard photos carry GPS.
- Rate limit as an **atomic DB counter** (`INSERT … ON CONFLICT … WHERE count < ceiling`), per token and per IP, IPv6 normalized to a /64 prefix, `trust proxy: 1`. In-memory buckets are per-process and N instances overspend the limit N times over.
- Analysis is **queued, not synchronous**. The customer gets an immediate acknowledgement.
- Submission lands as a `DRAFT` project with an `ImportSession` waiting for the builder.
- Google API errors are never propagated raw to UI or logs. Wrap with a safe helper returning a generic user-facing message plus a server-logged `err_<12 hex>` correlation ref.

## Model access

Vertex AI only, per the global rule: the consumer `generativelanguage.googleapis.com` endpoint permits Google to use prompts for training, and these are customer photographs.

GCP project `pool-forge-prod` (number `764613501658`) is created with `aiplatform.googleapis.com` and `storage.googleapis.com` enabled. **Billing is not yet linked** — the billing account is at its 5-project quota. Until that is resolved, `GCP_PROJECT_ID` points at an already-billed project. Config is `GCP_PROJECT_ID`, `VERTEX_LOCATION`, and ADC; no key files in the repo.

Cost control: classify with a cheap model and extract with the strong one; downscale to 1568px before any call; cache on `sha256 + extractorVersion` so re-analysis is free.

## Testing

- **Pure functions** (grid detection, Douglas-Peucker, snapping, unit conversion, calibration math, polygon→Shape translation) get ordinary unit tests. No mocks needed; there is nothing to mock.
- **Extraction** runs against a golden corpus of ~15 fixture images in `src/test/fixtures/images/` with hand-authored expected intents. Assertions are tolerance-based: dimensions within 5%, `shapeFamily` exact, features as a subset match. Default runs replay recorded model responses; `VERTEX_LIVE=1` hits the real endpoint.
- **Integration tests hit the real DB** per repo convention. Per-test unique IDs interpolating `orgId` into every unique-indexed field.
- The money path gets one end-to-end spec: sketch upload → applied project → priced quote.

## Track structure

**Wave I0 — contract commit. One agent, blocking, no behaviour change.**
Prisma models + migration · `modules/storage/` BlobStore + local driver · `DesignIntent` schema · the `POLYGON_POOL` shape primitive with `lib/geometry/polygon-footprint.ts` and its renderer · `import` command category registered · survey data-URL migration.

> **Roadmap amendment.** Wave 1 T2 (`2026-07-24-w1-t2-footprints.md`) was slated to create the freeform polygon footprint. Because full auto geometry needs it first, **I0 owns the primitive and T2 becomes a consumer**. T2's plan must be amended before that agent starts. I0 also touches `shapes.ts`, `renderers.ts`, and `measurements/engine.ts`, which W0/T1/T2/T3 touch; I0 lands before any Wave 1 agent starts, or Wave 1 rebases onto it. This is the direct cost of jumping the queue and it is accepted.

Then five tracks over disjoint files:

| Track | Scope | Owns |
|---|---|---|
| **I1** Ingest | Upload route, dedupe, EXIF strip, downscale, thumbnails, org-scoped blob serving | `app/api/imports/`, `modules/imports/ingest/` |
| **I2** Extraction | Vertex client, classifier + 5 extractors, Zod + one-shot repair, analysis persistence, prompt versioning, cost logging | `modules/imports/vision/` |
| **I3** Precision | Grid detection, DP simplify, axis/grid snapping, scale resolution, polygon→Shape translation | `modules/imports/precision/`, `lib/geometry/` additions |
| **I4** Review | `/projects/[id]/import`, overlay canvas, confidence UI, intent editing, apply-diff | `app/(app)/projects/[id]/import/`, `components/imports/` |
| **I5** Intake | `/intake/[token]`, link management, rate limits, queued analysis, lead landing | `app/intake/`, `modules/imports/intake/` |

**I6 — integration.** End-to-end money path plus the eval harness over the golden corpus.

I2 and I3 depend only on the `DesignIntent` contract, so they start the moment I0's schema file exists rather than waiting for the full contract commit. I4 codes against fixtures. I1 and I5 need I0's models.

## Open risks found by live testing

**Model-reported confidence is top-compressed.** A first live run against
`gemini-2.5-pro` in `us-central1` returned `1.0` on every confidence field for a
clean vector sketch, and `0.90` to `0.95` for the same sketch degraded to a
blurred, noisy, low-contrast, quality-42 recompression. It read both cases
correctly, so the high scores were not wrong, but the review gate keys on
scores below `0.6` and will rarely fire on model self-assessment alone.

Consequence: the deterministic downgrades are the real safety net, not the
model's opinion of itself. Those already exist and must not be weakened:
unparseable dimension text, an assumed unit on a bare number, and scale
candidates disagreeing beyond 5% each subtract confidence in code. I6's eval
harness should measure gate firing rate against the golden corpus and treat a
near-zero rate as a defect, not a pass.

The extraction itself was accurate on first contact: scale legend, both
dimension strings with pixel endpoints, both depths, the spa with its size, and
the deck material all read correctly, and the response validated against
`SketchResponseSchema` with no repair round-trip.

## Acceptance for the wave

A builder uploads a photograph of a dimensioned graph-paper sketch, reviews an extracted design where every number is either deterministically measured or badged for review, applies it in one undoable action, and reads a priced quote from the result. A homeowner uploads three inspiration images through a public link and the builder finds a draft project waiting.
