# Tampa Bay pool contractor census

Pulls 24 months of residential pool permits from Hillsborough, Pinellas, and Pasco
permit systems, dedupes by contractor (normalized name + state license number),
and ranks builders by permit volume. Output: `out/contractor-census.csv` (full
ranked list) and `out/report.md` (headline numbers + top 50 call list).

## Sources

| Jurisdiction | Enumeration | Contractor | Notes |
|---|---|---|---|
| Hillsborough Co (unincorp.) | ArcGIS `AccelaDashBoard` layer 4 (issued permits, epoch-ms dates) | HCFL Accela CapDetail per permit | Pool = residential + description LIKE %POOL% minus cage/screen/enclosure |
| Tampa | ACA search: `Building/Residential/Miscellaneous/Pool` (exists Mar 2026+) plus `Miscellaneous/NA` CSV export for Sep 2024 to Feb 2026 | Tampa Accela CapDetail per record | Pre-Mar-2026 pools identified by Project Description on the detail page; ACA dates are application dates |
| Pasco Co (unincorp.) | ACA search: `Building/Residential/Pool and Spa/NA` (RESPOOL records), paginated walk | Pasco Accela CapDetail per record | Date filter is open/application date; company `OIC` = owner-is-contractor |
| Pinellas (countywide) | PCPAO nightly `RP_PERMITS` dump, `PERMIT_DSCR='POOL'`, real issue dates, all 19 issuing agencies | Accela CapDetail for County + Clearwater agencies only | St. Petersburg (largest city share) is login-gated (Click2Gov): permits counted, contractors unavailable |

Not covered: Plant City, Temple Terrace (own departments, no feed found), Pasco's
incorporated cities (Dade City, Zephyrhills, New Port Richey, Port Richey),
and contractor names for Pinellas cities other than Clearwater.

## Run order

```sh
# 1. Enumerate (fast)
python3 - <<'EOF'   # Hillsborough ArcGIS pull: see git history or rerun query in fetch notes
EOF
python3 walk-tampa.py "Building/Residential/Miscellaneous/Pool" 03/01/2026 08/30/2026 data/tampa_pool_rows.jsonl
# Tampa Misc/NA CSV export + Pasco walk + PCPAO extract: see session scripts

# 2. Enrich with contractor names (slow, resumable, ~0.35s/request)
python3 fetch-hcfl-details.py data/hillsborough_rows.json data/hcfl_details.jsonl
python3 fetch-pasco-details.py data/pasco_rows.jsonl data/pasco_details.jsonl
python3 fetch-pinellas-details.py data/pinellas_pool_permits.json data/pinellas_details.jsonl
python3 fetch-tampa-details.py data/tampa_pool_rows.jsonl data/tampa_miscna_rows.json data/tampa_details.jsonl

# 3. Aggregate
python3 convert.py
node census.mjs
```

## Dedupe rules (`normalize.mjs`)

Uppercase; keep the trade name after `DBA`; pick the business segment of
`COMPANY/Qualifier` values; strip punctuation and corporate suffixes (INC, LLC,
OF FLORIDA, ...); collapse `POOL`/`POOLS` and `POOLS AND SPAS`/`POOLS`. Records
sharing a normalized name OR a state license number (CPC/CGC/CBC + digits)
merge via union-find, so `CURTISPOOLS` and `Curtis Pools` unify through their
shared CPC number. Owner-builder permits (OWNER, OIC) are counted separately,
never as companies.

## Caveats for reading the numbers

- Window: Sep 2024 through Aug 2026. Hillsborough County and Pinellas use true
  issue dates; Tampa and Pasco use application dates (their public search
  filters on it), so edge months differ slightly.
- Pasco/Tampa rows include in-flight applications (plan review etc.);
  withdrawn/abandoned are dropped. Hillsborough and Pinellas are issued-only.
- Pinellas PCPAO `POOL` type includes some non-construction pool permits
  (repairs/resurfacing) since the appraiser classifies broadly; the ACA record
  type on enriched rows is construction ("Residential Pools and Spas").
