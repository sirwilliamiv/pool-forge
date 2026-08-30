# Site import: address to scaled backdrop and building

Approved in chat 2026-08-30. V1 of "type an address, get the property in the
editor."

## What the user gets

On the project page, the address field autocompletes against real addresses.
Picking one stores the location on the project and enables **Import site** in
the editor, which:

1. Drops a satellite photo of the property under the drawing, at true scale,
   position snapped to the 6" grid. Visible in plan and 3D (it is one scene).
2. If the Solar API knows the building: draws the house footprint as shapes.

Everything traced over the backdrop snaps to the grid as it always has; the
backdrop is reference, not geometry.

## Parcels: rejected

The design originally included a parcel import backed by Regrid (Google has no
parcel API). Built, then removed 2026-08-30: an assessor data provider is not
wanted. Assessor lines are tax-map approximations, not surveys, and property
lines stay hand-drawn via the existing property-line stencil.
`Project.parcelId` and `Project.jurisdiction` remain hand-entered permit
fields; nothing autofills them.

## Provider facts that shaped the design

- Google ToS forbids storing Static Maps imagery. We therefore persist
  `{lat, lng, zoom, px}` and re-fetch tiles through an authenticated proxy at
  view time. The image never enters the blob store. Cache-Control on the proxy
  stays short (max 1 day).
- Static Maps ground resolution is exact: `metersPerPx = 156543.03392 ×
  cos(latRad) / 2^zoom / scale`. That number, converted to inches, replaces
  manual calibration.
- Solar API `buildingInsights` returns the building bounding box and roof
  segments for a lat/lng; enough for a footprint outline in v1.

## Architecture

New module `src/modules/site/geo/` owns everything geographic:

- `mercator.ts`: pure math. metersPerPx, inchesPerPx, local tangent-plane
  projection lat/lng → editor inches centred on the site origin (equirect
  approximation is fine at yard scale), and its inverse. Property-tested.
- `google.ts`: server client for Places Autocomplete (New), Place Details,
  Static Maps URL building, Solar buildingInsights. Reads `MAPS_API_KEY`.
  Absent key = feature off, never a crash.
- `types.ts`: zod schemas shared by commands and routes.

API routes (all `requireSession()` + org scoping, keys never leave the
server):

- `GET /api/site/autocomplete?q=&session=` → proxied Places Autocomplete (New)
  suggestions.
- `GET /api/projects/[id]/satellite?zoom=&w=&h=` → image proxy; resolves the
  project's stored lat/lng server-side, fetches Google, streams back.
  `Cache-Control: private, max-age=86400`.

Commands (registry-first, per repo convention):

- `site.address.set` (server): input placeId or {address, lat, lng}; resolves
  details, writes `Project.siteAddress/sitePlaceId/latitude/longitude`.
- `site.import.satellite` (runsOn client, modeled on `import.intent.apply`):
  server validates + computes `SurveyGeo` (zoom, px, inch dimensions from
  GSD); client handler writes `surveyStore` with x/y snapped by `snapToGrid`.
- `site.import.building` (server): Solar footprint → house shape, appended to
  `rootJson.shapes`, exactly the `import.intent.apply` append pattern.

## Data changes

- Prisma `Project`: `siteAddress String?`, `sitePlaceId String?`,
  `latitude Float?`, `longitude Float?` (+ migration, applied to prod at
  deploy).
- `rootJson.survey` (JSON, no migration): `SurveyConfig` gains optional
  `geo: { lat, lng, zoom, mapWidthPx, mapHeightPx }`. When `geo` is present
  the renderer sources the image from the satellite proxy; `sourceImageId`
  stays for uploaded surveys. Calibration fields are populated from GSD so
  existing UI keeps working.

## Rendering

New `SatelliteUnderlay` in `src/components/editor/three/`: a textured plane,
`widthInches/heightInches` converted by `feet()`, positioned between
`Ground.tsx`'s base plane (y=-2) and the grid (above -2, below 0) to avoid
z-fighting, honoring `survey.opacity` and `locked`. Also wires the
already-stubbed `surveyImageUrl` in `src/modules/exports/document/build.tsx`
so the site-plan PDF shows the backdrop.

## Config

- `MAPS_API_KEY`: Secret Manager `pool-forge-maps-api-key` (created
  2026-08-30, restricted to Places/Geocoding/Static Maps/Solar), mounted as
  optional secret by deploy.sh. Never `NEXT_PUBLIC_*`.
- `.env.example` documents it.

## Testing

- Property tests on `mercator.ts` (projection roundtrip, GSD monotonic in
  zoom, scale correctness against known constants).
- Unit tests on zod schemas and command input validation.
- Integration tests on commands: org scoping, degrade-without-key, append
  semantics (never replace shapes), audit log rows.
- Renderer: existing brand/palette ratchet applies; no new hex values.

## Out of scope (v2 candidates)

Photorealistic 3D Tiles neighborhood context; Solar dataLayers DSM → terrain
grades; Nearmap-quality licensed imagery.
