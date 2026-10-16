# Pool Forge: Fast Estimate Spec

Status: Draft v1 · Date: 2026-10-16 · Owner: Billy
Audience: coding agent + Billy (founder, engineer)
Design partner: Holiday Pools of West FL (Sarasota, ~23 permits/mo, 2 sales reps on Pool Forge)

About assumptions. This spec was written without reading the Pool Forge codebase. Anything about current code, data shapes, or behavior is tagged [ASSUMPTION] and needs checking against the repo before implementation. The only current-state facts treated as given are the ones the Visio import work reports (section 0).

## 0. What already exists (given)

The Visio stencil import is live (commit b09e050, revision pool-forge-00031) and is not a dependency of this spec.

- Builders import Visio stencils (.vss / .vssx) into an org library (`src/modules/imports/visio/`, commands `stencil.library.*`).
- Pool masters import as real freeform pool objects (`POLYGON_POOL`). They already measure and price.
- Spa and deck masters import as spa and deck objects, sized to their bounding box.
- All other masters import as labelled outlines (`SKETCH_PATH`, no measurements used for pricing).
- A stencil dragged onto the canvas lands at real size, centred under the pointer.
- Spa parts: the importer bug where any master whose name contained "spa" became a spa (Spa Step, Spa Coping, Spa Seat, Spa Drains) was fixed in commit 9a81afb. A name that also carries a part word never classifies as `SPA`. Fast Estimate keeps the guard in section 7 regardless, because the builder can change the kind by hand in the preview and a saved selection can be any kind.

Fast Estimate reads its geometry from these existing freeform pool, spa, and deck objects. It never reads stencil files directly.

## 1. Goal and success metrics

Goal: a rep standing in the yard with a tablet goes from opening the app to sending a priced, accurate estimate in under 2 minutes. To get there, we cut existing functionality down to the shortest path: drop stencil, answer site questions, auto-fill, adjust, send.

| Metric | Target | How it is measured |
|---|---|---|
| Time from open to sent | p50 < 2:00, p90 < 3:00 | Server timestamps: `estimate.opened_at` to `estimate.sent_at`, per rep |
| Estimate-to-contract variance | < 3% absolute, per job | `abs(contract_total - estimate_total) / estimate_total`, first sent version vs the signed contract |
| Manual line edits per estimate | <= 3 (tracked, not gated) | Count of `LineOverride` rows |
| Sends blocked by guardrails that the rep later sends unchanged | trending to 0 | Shows guardrails that are too strict |

Measurement population: Holiday's 2 reps, at least 20 sent estimates each after launch. Baseline is their last 30 days on the current flow [ASSUMPTION: existing estimates have usable timestamps; otherwise capture baseline with a manual stopwatch over 10 estimates]. Variance is only measurable once contracts are signed, which can take weeks, so there is a 60-day reporting window.

Non-goals: CAD-grade design, financing, e-signature changes, job scheduling, the Visio importer itself.

## 2. Price list model

### 2.1 Ownership

- Each builder imports and owns its price lists (scoped by org). Pool Forge does not ship a default list; it may ship a sample CSV template.
- Exactly one active version per builder. Older versions stay read-only and are never deleted while any estimate references them.

### 2.2 Item fields

| Field | Type | Notes |
|---|---|---|
| `sku` | string, unique within a version | Stable across versions. It is the key for diffs and bundles |
| `name` | string | Customer-facing |
| `unit` | `ea`, `sqft`, `lf`, `cuyd` | |
| `cost` | decimal(12,2) | Builder cost per unit |
| `markup` | decimal (0.35 = 35%) | `unit_price = round2(cost * (1 + markup))` |
| `category` | enum/string | For example Excavation, Structure, Plumbing, Tile/Coping, Deck, Equipment, Finish, Electrical, Gas, Permits, Site, Add-ons |
| `driver` | DriverRule | How quantity is derived (2.3) |
| `requires` | sku[] | Dependencies (2.4) |
| `round` | `{mode: up or nearest, increment}` | For example excavation rounds up to 1 cuyd |
| `waste` | decimal, default 0 | Multiplier applied before rounding (0.05 = +5%) |
| `condition` | Expr, optional | When the item auto-includes (for example `answers.deck_material == "pavers"`) |
| `addon_group` | string, optional | Puts the item behind a one-tap toggle (spa, lights, water features, screen) |
| `required_category` | bool (on the category) | Blocks send if no line in this category (5) |

### 2.3 Driver rules

A driver is one of the following. The formula is a small, safe expression language over the measurement variables (no eval; use a whitelisted parser).

| Kind | Quantity |
|---|---|
| `area` | formula over area variables, default `pool.area` |
| `perimeter` | default `pool.perimeter` |
| `volume` | default `pool.volume_cuyd` |
| `depth` | uses depth variables (for example tiered pricing on `pool.depth_max`) |
| `fixed` | constant count (`qty: 1`) |
| `manual` | 0 until the rep enters a quantity; never auto-filled |

Variables available to formulas (read from canvas objects; see 3.2): `pool.area`, `pool.perimeter`, `pool.depth_min`, `pool.depth_max`, `pool.depth_avg`, `pool.volume_cuft`, `pool.volume_cuyd`, `pool.length`, `pool.width`, `pool.shell_sqft`, `spa.count`, `spa.area`, `spa.perimeter`, `deck.area`, `deck.perimeter`, `answers.<key>`, `site.distance_to_house`.
Functions: `ceil`, `floor`, `round`, `min`, `max`, `if(cond,a,b)`.

Derived defaults (overridable per builder):

- `pool.shell_sqft = pool.area + pool.perimeter * pool.depth_avg`
- excavation cuyd = `(pool.length+2) * (pool.width+2) * (pool.depth_avg+0.5) / 27`. This uses length and width (the bounding box) for freeform pools [ASSUMPTION: Holiday's dig formula. Confirm with them]

### 2.4 Dependencies

- `requires` builds a directed graph, for example `SPA-RSD` requires `HTR-GAS` requires `GAS-LN`. Adding an item adds everything it requires, transitively. Removing a required item is blocked while a dependent item remains; the UI offers "remove X and its dependents."
- Import rejects cycles and unknown SKUs.
- An item that was added through a dependency is marked `source: dependency` so the UI can explain why it is there.

### 2.5 Versioning

- Each import creates a new `PriceListVersion` (`v{n}`, `imported_at`, `imported_by`, file hash, row count). Activating a version is a separate, explicit step that shows a diff (added, removed, and changed cost/markup/driver, by SKU).
- An estimate is pinned to the version it was created on. Re-pricing a draft on a newer version is explicit ("Update to v13", with a diff of the total). Once an estimate is sent, its version never changes.

### 2.6 Import format (CSV / XLSX)

- XLSX: the first sheet, or a sheet the user picks. Row 1 is headers. CSV must be UTF-8 (strip any BOM).
- Column mapping step: auto-match headers case-insensitively against aliases (for example Item #/Part/SKU to `sku`, Cost/Unit Cost to `cost`). The user confirms or fixes the mapping. The mapping is saved per builder and reused next time.
- Columns: `sku, name, unit, cost, markup, category, driver_kind, driver_formula, requires` (semicolon-separated SKUs), `round_mode, round_increment, waste, condition, addon_group`. Columns from `driver_formula` onward are optional. If `driver_kind` is missing, it defaults to `manual`.
- `markup` accepts `35`, `35%`, or `0.35`, normalized as follows: a value > 1 is treated as a percentage. Values > 300% are flagged.

Validation (all errors reported together, with row numbers; import is all-or-nothing):

| Rule | Severity |
|---|---|
| Missing `sku`/`name`/`unit`/`cost`/`category` | error |
| Duplicate `sku` | error |
| `unit` not in {ea, sqft, lf, cuyd} (normalize SF, LF, CY, EA) | error |
| `cost` < 0, or not a number | error |
| `driver_formula` fails to parse, or uses an unknown variable | error |
| `requires` points to an unknown SKU, or forms a cycle | error |
| driver unit doesn't fit (for example `unit=lf`, `driver=area`) | warning |
| `markup` < 0 or > 300% | warning |
| A required category has no items | warning |
| Compared with the active version: cost change > 25% on a SKU | warning (shown in diff) |

## 3. Input flow (one screen, top to bottom)

One scrolling screen. No modals on the main path. Tablet portrait first, with tap targets >= 44pt. The live total sits in a sticky footer.

### 3.1 Steps

1. Drop a library stencil. The rep picks a pool stencil from the builder's Visio library (search + recent) and drops it on the canvas, where it lands at real size. They can optionally drop a spa or deck stencil. Resize and depth edits use the existing freeform object controls [ASSUMPTION: the existing controls can be reached from this screen without leaving it].
2. Site questions (6). Each is a segmented control with a default preselected:

| Key | Options (example) | Typical effect |
|---|---|---|
| `access` | Open / Tight / Crane | Surcharge item; excavation multiplier |
| `soil` | Sand / Clay / Rock / High water table | Excavation multiplier; dewatering item |
| `deck_material` | Pavers / Travertine / Concrete / None | Which deck SKU auto-fills |
| `equipment_package` | Standard / Upgraded / Premium | Which equipment SKU |
| `finish` | Plaster / Quartz / Pebble | Which finish SKU |
| `distance_to_house` | numeric ft (stepper, 10 ft increments) | Electrical/gas run lengths |

   The builder configures the option lists and maps each option to SKUs or multipliers through item conditions.
3. Auto-fill. Every change re-evaluates all driver rules in under 100 ms, on the device. No network round-trip is needed.
4. Add-on toggles. One-tap chips: Spa, Lights, Water features, Screen enclosure. Each chip turns on its `addon_group` items plus their dependencies. If a spa object is on the canvas, the Spa toggle defaults on, unless the spa guard trips (7).
5. Adjust in the line editor (4), which is inline below the toggles.
6. Send. Guardrails run (5). Then: customer name + email/phone (prefilled if the estimate came from a lead), send PDF/link.

### 3.2 Measurement interface (canvas to estimate)

Fast Estimate reads the existing objects through one adapter, so the pricing engine never touches canvas internals:

```ts
interface MeasurementSource {
  pool(): PoolMeasure | null;   // first/primary freeform pool on canvas
  spas(): SpaMeasure[];         // spa objects (bounding-box sized)
  decks(): DeckMeasure[];       // deck objects (bounding-box sized)
  onChange(cb: () => void): Unsubscribe;
}
interface PoolMeasure {
  objectId: string;
  shape: "rectangle" | "freeform" | string; // as reported by object
  length_ft: number; width_ft: number;      // bounding box
  depth_min_ft: number; depth_max_ft: number; depth_avg_ft: number;
  area_sqft: number; perimeter_lf: number; volume_cuft: number;
  sourceMaster?: { stencil: string; masterName: string };
}
interface SpaMeasure  { objectId: string; area_sqft: number; perimeter_lf: number; length_ft: number; width_ft: number; masterName?: string; }
interface DeckMeasure { objectId: string; area_sqft: number; perimeter_lf: number; masterName?: string; }
```

[ASSUMPTION] The freeform pool object already computes area, perimeter, and volume, since "they already measure and price." The adapter should wrap those existing computations, not reimplement them. If depth profile or volume isn't exposed today, exposing it is milestone M0 work.

## 4. Line editor

- The full price list is always reachable. A search box ("type 2 letters") over SKU, name, and category. One tap adds the item at its driver quantity, or at qty 1 if the driver is manual. Fuzzy match, results in under 50 ms on 2,000 items.
- Lines grouped by category. Each category header shows its subtotal; the sticky footer shows the grand total and margin %, with margin visible to the rep only if the builder enables it.
- Inline edits: tap a qty or a unit price to edit it. Any change away from the computed value creates a `LineOverride` (original, new value, rep, timestamp). The line shows an "edited" badge, and the estimate gets flagged manager review. Review is asynchronous: it does not block send unless the override pushes margin below the floor (5). "Reset" puts the computed value back.
- Removing an auto-filled line keeps it as excluded (struck through, restorable), so a later re-evaluation won't add it back.
- Saved bundles: a named set of `{sku, qty_override?}`, for example "Sun shelf + bubblers." One tap applies the bundle; dependencies resolve. Bundles belong to the builder and reference SKUs, so they survive version changes. A SKU missing from the active version is skipped with a notice.

## 5. Accuracy guardrails

| Guardrail | Behavior |
|---|---|
| Required categories | The builder marks categories as required (for example Excavation, Structure, Plumbing, Equipment, Finish, Permits). Send is blocked while any required category has no active line. The block names the missing category and gives a one-tap jump to search filtered to it. |
| Margin floor | The owner sets a floor, for example 22% gross margin = (price - cost)/price across the estimate. Below the floor, send turns into Request approval: an owner/manager approves or rejects in the app or by push/email, and the estimate sends once approved. The approval is stored with the reason. |
| Version stamp | Every estimate stores `price_list_version_id`. The PDF footer prints "Price list v{n} · {date}". |
| Geometry sanity | Block send if there's no pool object, area <= 0, or volume <= 0. Warn if `depth_max < depth_min` or `depth_max > 12 ft`. |
| Stale draft | If a draft was priced on a version that is no longer active, warn (don't block) and offer re-price with a diff. |
| Spa misclassification | See 7. |

## 6. Cut list (moves to the post-sale job workspace)

Anything not on the path stencil, questions, auto-fill, adjust, send comes off the estimate screen. The functionality stays; it moves to the job workspace and is reached after the contract is signed (or through "More" on a draft).

[ASSUMPTION] The current estimate UI has not been inventoried. Billy or the agent must list every current estimate-screen feature and sort each one with this rule:

| Keep on fast path | Move to job workspace (examples to verify) |
|---|---|
| Stencil drop + basic resize/depth | Detailed CAD editing, layers, annotations, elevation drawings |
| 6 site questions | Long-form site survey, photo capture, soil reports |
| Auto-filled lines, search-add, bundles, inline edits | Vendor/PO generation, material takeoffs by supplier |
| Toggles: spa, lights, water features, screen | Selections of specific finish colors/tile patterns (category-level price only on the estimate) |
| Totals by category, margin indicator | Payment schedule/draw editing, financing |
| Send (PDF/link) | Permit packet, HOA docs, scheduling, crew assignment, change orders |

Rule of thumb: if a feature doesn't change the total by more than 1% on a typical job, it does not belong on the fast path.

## 7. Edge cases

| Case | Handling |
|---|---|
| A spa-kind object that is really a part (Spa Step, Spa Coping imported before 9a81afb, or re-kinded by hand) | Before auto-enabling Spa, require that the spa object (a) has area >= 25 sqft and (b) has a `masterName` that does not match `/step\|coping\|seat\|bench\|ledge\|drain\|light\|return\|jet\|beam\|template/i`. Otherwise Spa stays off and the rep confirms it with one tap ("Is this a spa?"). |
| Multiple pool objects | Primary = the largest by area; the other pools are ignored, with a warning. A multi-pool estimate is out of scope for v1. |
| Spa attached to the pool (overlap) | Use pool measurements as-is. [ASSUMPTION: the freeform pool doesn't already include the spa area] |
| No deck object, but `deck_material` != None | Deck qty falls back to a builder-set band formula, for example `(L+8)(W+8) - pool.area`. The line shows "estimated band, draw deck to refine." |
| Deck object overlaps the pool | Deck area = deck bbox area minus overlap with pool/spa [ASSUMPTION: the existing deck object doesn't subtract it] |
| Depth profile missing on the imported pool | Use builder defaults (3.5 / 6 ft) and show a warning badge on the depth field |
| Formula error at runtime (for example divide by zero) | Line qty = 0, flagged red, and that line's category counts as missing for the required-category check |
| Dependency SKU missing in the active version | Block activation of that version at import (error) |
| Offline in the yard | Price list, library, and engine are all cached on the device. Send queues and retries; the rep sees "Queued." The version stamp is the cached version. If a newer version exists when sync happens, the send still goes out on the cached version and the manager is notified. |
| Rep overrides price to $0 | Allowed, flagged for review, and counted in the margin |
| Markup applied twice (cost already includes margin) | Import warning if the median markup is < 5% or > 150% |
| Tax | Out of scope for v1. The total is labelled "before tax" [OPEN QUESTION] |

## 8. Data model sketch

```ts
type Unit = "ea" | "sqft" | "lf" | "cuyd";
type DriverKind = "area" | "perimeter" | "volume" | "depth" | "fixed" | "manual";
interface PriceList        { id: ID; builderId: ID; activeVersionId: ID | null; }
interface PriceListVersion { id: ID; priceListId: ID; n: number; importedAt: Date; importedBy: ID;
                             fileHash: string; status: "draft" | "active" | "retired";
                             requiredCategories: string[]; marginFloor: number; }
interface PriceItem {
  id: ID; versionId: ID; sku: string; name: string; unit: Unit;
  cost: Decimal; markup: Decimal; category: string;
  driver: { kind: DriverKind; formula?: string; fixedQty?: number };
  requires: string[];               // SKUs
  round?: { mode: "up" | "nearest"; increment: number };
  waste?: number; condition?: string; addonGroup?: string;
}
interface ImportMapping { builderId: ID; columns: Record<string /*header*/, keyof PriceItem | "ignore">; }
interface SiteQuestion { key: string; label: string; type: "choice" | "number"; options?: string[]; default: string | number; }
interface Bundle { id: ID; builderId: ID; name: string; items: { sku: string; qty?: number }[]; }
interface Estimate {
  id: ID; builderId: ID; repId: ID; customerId?: ID;
  priceListVersionId: ID;           // pinned
  canvasRef: ID;                    // existing design/canvas record [ASSUMPTION]
  measurements: MeasurementSnapshot; // frozen on send
  answers: Record<string, string | number>;
  addons: string[];                 // addon_group keys on
  lines: EstimateLine[];
  totals: { cost: Decimal; price: Decimal; margin: number; byCategory: Record<string, Decimal> };
  status: "draft" | "pending_approval" | "sent" | "contracted" | "lost";
  reviewFlag: boolean; openedAt: Date; sentAt?: Date;
  contractTotal?: Decimal;          // for variance metric
}
interface EstimateLine {
  sku: string; name: string; unit: Unit; category: string;
  computedQty: number; qty: number; unitCost: Decimal; unitPrice: Decimal;
  source: "driver" | "addon" | "dependency" | "bundle" | "manual";
  excluded: boolean; override?: LineOverride;
}
interface LineOverride { field: "qty" | "unitPrice"; from: number; to: number; by: ID; at: Date; reviewedBy?: ID; }
interface MarginApproval { estimateId: ID; requestedBy: ID; margin: number; floor: number; decidedBy?: ID; decision?: "approved" | "rejected"; reason?: string; }
type MeasurementSnapshot = { pool: PoolMeasure; spas: SpaMeasure[]; decks: DeckMeasure[]; takenAt: Date };
```

Engine: `price(version, measurements, answers, addons, edits)` returns lines + totals. It is a pure function, deterministic, and runs on the client, with the same code on the server for validation at send. Order: evaluate conditions, driver qty, waste, round, add addon/dependency closure, apply exclusions and overrides, totals.

## 9. Worked example: 15x30 pool with spa

EXAMPLE PRICES ONLY. These are made-up illustrative costs and markups, not Holiday Pools' prices.

Canvas: a rectangular 15x30 pool stencil (depth 3.5 to 6 ft) and a 7x7 raised-spa stencil. No deck object, so the deck band fallback is used.
Measurements: area 450 sqft · perimeter 90 lf · depth_avg 4.75 ft · volume 2,137.5 cuft (about 15,990 gal) · shell_sqft = 450 + 90 x 4.75 = 877.5.
Answers: access = Tight, soil = Sand, deck = Pavers, equipment = Standard, finish = Pebble, distance_to_house = 40 ft. Add-ons: Spa on.

| SKU | Item | Unit | Driver to qty | Cost | Markup | Unit price | Ext. price |
|---|---|---|---|---|---|---|---|
| EXC-01 | Excavation & haul-off | cuyd | 32 x 17 x 5.25 / 27 = 105.8, ceil 106 | 18.00 | 35% | 24.30 | 2,575.80 |
| STL-01 | Steel/rebar | sqft | shell 877.5, up 10 = 880 | 2.10 | 30% | 2.73 | 2,402.40 |
| GUN-01 | Shotcrete shell | cuyd | 877.5 x 0.75 / 27 = 24.4, up 0.5 = 24.5 | 210.00 | 30% | 273.00 | 6,688.50 |
| PLM-01 | Plumbing base | ea | fixed 1 | 2,800.00 | 35% | 3,780.00 | 3,780.00 |
| TIL-01 | Waterline tile | lf | perimeter 90 | 14.00 | 40% | 19.60 | 1,764.00 |
| COP-01 | Coping | lf | perimeter 90 | 22.00 | 40% | 30.80 | 2,772.00 |
| DCK-PAV | Paver deck | sqft | band (23 x 38 - 450) = 424 x 1.05, up 10 = 450 | 9.50 | 35% | 12.83 | 5,773.50 |
| EQP-STD | Equipment pkg Standard | ea | fixed 1 (equipment=Standard) | 6,500.00 | 30% | 8,450.00 | 8,450.00 |
| FIN-PEB | Pebble finish | sqft | shell 877.5, ceil 878 | 5.25 | 40% | 7.35 | 6,453.30 |
| ELE-RUN | Electrical run | lf | distance + 10 = 50 | 18.00 | 35% | 24.30 | 1,215.00 |
| PRM-01 | Permit & engineering | ea | fixed 1 | 650.00 | 0% | 650.00 | 650.00 |
| ACC-TIGHT | Tight-access surcharge | ea | fixed 1 (access=Tight) | 1,200.00 | 25% | 1,500.00 | 1,500.00 |
| SPA-RSD | Raised spa 7x7 | ea | addon 1 | 9,500.00 | 35% | 12,825.00 | 12,825.00 |
| HTR-GAS | Gas heater 400k BTU | ea | dependency of SPA-RSD 1 | 3,200.00 | 30% | 4,160.00 | 4,160.00 |
| GAS-LN | Gas line | lf | dependency of HTR-GAS; distance + 15 = 55 | 28.00 | 35% | 37.80 | 2,079.00 |

Totals: cost $47,315.50 · price $63,088.50 (before tax) · gross margin 25.0%.
Guardrails: all required categories are present. Margin 25.0% is at or above the example 22% floor. Stamped "Price list v1 (example)".
Override scenario: the rep cuts the SPA-RSD price to $10,500. The total becomes $60,763.50, margin drops to 22.1%, the line is flagged for manager review, and send is still allowed. Cutting it to $10,000 brings the margin to 21.5%, which is below the floor, so the button becomes Request approval.

(Freeform pools use bounding-box L/W only for excavation. Area, perimeter, and volume come from the object.)

## 10. Open questions

1. What dig formula does Holiday use, and what over-dig allowance (the example uses 1 ft per side and 0.5 ft in depth)? Do they use cubic yards in situ or hauled?
2. Is the margin floor gross margin on price or markup on cost? (The example uses margin on price.) Is there one floor per builder or per category?
3. Who approves below the floor? Is it only the owner, or managers too? What should happen when nobody responds within N minutes in the yard?
4. Should sales tax or permit fees by county (Sarasota vs. Manatee) be on the estimate?
5. Is the spa guard threshold (>= 25 sqft, name exclusion) acceptable now that the importer no longer misclassifies parts? Keep it as the second line of defence.
6. What does Holiday's current price list look like (format, row count, do they already use a markup column)? We need a real file to tune the mapping aliases.
7. Should variance be measured against the first sent version or the last sent version before contract? (The spec says first sent.)
8. Which current estimate-screen features do Holiday's reps actually use? Their answer drives the cut list.
9. Should reps see margin, or only managers?

## 11. Milestone plan and acceptance tests

| # | Milestone | Acceptance tests |
|---|---|---|
| M0 | Audit + measurement adapter | (a) Inventory of the current estimate screen, with every feature sorted keep or move. (b) `MeasurementSource` returns area, perimeter, depth, and volume for an imported freeform pool. Values match the object's existing displayed measurements within 0.1%. (c) Spa/deck bbox values are exposed. |
| M1 | Price list import + versioning | (a) Holiday's real CSV/XLSX imports after the mapping step; the mapping is saved and auto-applies on re-import. (b) A fixture file containing every 2.6 error reports all errors with row numbers and imports nothing. (c) A cycle A requires B requires A is rejected. (d) Activating v2 shows a correct SKU diff; existing estimates stay on v1. |
| M2 | Pricing engine | (a) The section 9 example reproduces exactly: $63,088.50 price / $47,315.50 cost. (b) Toggling Spa adds SPA-RSD, HTR-GAS, and GAS-LN; removing HTR-GAS while the spa is on is blocked. (c) Engine run time < 100 ms for 2,000 items on a target tablet [ASSUMPTION: an iPad 9th gen or equivalent as baseline]. (d) Client and server totals are identical for 1,000 randomized inputs. |
| M3 | One-screen flow + editor | (a) Stencil drop, 6 questions, toggles, send, all on one screen with no navigation. (b) Search adds any SKU in a single tap. (c) A qty/price edit sets the review flag and records a `LineOverride`. (d) A bundle applies and resolves dependencies. (e) Works offline; send queues. |
| M4 | Guardrails | (a) A missing required category blocks send and names the category. (b) Below the floor: approval request, send after approval; a rejection keeps it as a draft. (c) The PDF shows the version stamp. (d) A "Spa Step" object does not auto-enable Spa or the heater/gas lines. |
| M5 | Cut + pilot with Holiday | (a) Moved features can be reached from the job workspace; nothing deleted. (b) Instrumentation logs `opened_at`/`sent_at`/`contract_total`. (c) Over >= 20 estimates per rep: p50 open to sent < 2:00. (d) Over the 60-day window: >= 80% of contracted jobs with variance < 3%, with a variance report sorted by the category that caused it. |

Order: M0, M1, M2 (parallel with M3 UI shell), M3, M4, M5. M2's test (a) is the gate for the UI work.
