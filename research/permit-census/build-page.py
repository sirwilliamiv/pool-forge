#!/usr/bin/env python3
"""Render out/contractor-census.csv into out/census-page.html (the shareable report)."""
import csv, html, json, re
from datetime import date

rows = list(csv.DictReader(open("out/contractor-census.csv")))
N = lambda r: int(r["permits_24mo"])

def display_name(raw):
    if "/" in raw:
        head, tail = raw.split("/", 1)
        if not re.search(r"\b(INC|LLC|CORP|POOL|SPA)\b", tail.upper()) and len(head) >= 8:
            raw = head
    return raw.strip().title().replace("Llc", "LLC").replace("Inc", "Inc").replace("'S", "'s")

def short_j(s):
    out = []
    for part in s.split("; "):
        j, _, c = part.rpartition(":")
        j = (j.replace("Hillsborough County (unincorporated)", "Hillsborough")
             .replace("Pasco County (unincorporated)", "Pasco")
             .replace("Pinellas County (unincorporated + contract cities)", "Pinellas Co")
             .replace("Pinellas · ", ""))
        out.append((j, int(c)))
    return out

tiers = [("24+", 24, 10**9), ("12 to 23", 12, 23), ("6 to 11", 6, 11), ("2 to 5", 2, 5), ("1", 1, 1)]
tier_counts = [(label, sum(1 for r in rows if lo <= N(r) <= hi)) for label, lo, hi in tiers]
total_by_contractor = sum(N(r) for r in rows)
top10 = sum(N(r) for r in rows[:10])
top25 = sum(N(r) for r in rows[:25])
builders6 = sum(1 for r in rows if N(r) >= 6)

juris_totals = {}
for r in rows:
    for j, c in short_j(r["jurisdictions"]):
        juris_totals[j] = juris_totals.get(j, 0) + c
# permits with no contractor, by jurisdiction (from census report knowledge)
NO_CONTRACTOR = {"St Petersburg": 777, "Pinellas beach + small cities": 371,
                 "Largo": 84, "Dunedin": 92}

maxp = N(rows[0])
bar_rows = ""
for i, r in enumerate(rows[:25]):
    name = html.escape(display_name(r["contractor"]))
    juris = html.escape(" · ".join(f"{j} {c}" for j, c in short_j(r["jurisdictions"])))
    pct = N(r) / maxp * 100
    bar_rows += f'''<div class="brow" title="{juris}">
      <div class="bname">{name}</div>
      <div class="btrack"><div class="bfill" style="width:{pct:.1f}%"></div>
      <span class="bval">{N(r)}</span></div></div>\n'''

table_rows = ""
for i, r in enumerate(rows[:50]):
    name = html.escape(display_name(r["contractor"]))
    juris = html.escape(" · ".join(f"{j} {c}" for j, c in short_j(r["jurisdictions"])))
    lic = html.escape(r["licenses"] or "·")
    pct = N(r) / maxp * 100
    table_rows += f'''<tr><td class="mono rk">{i+1}</td><td class="nm">{name}</td>
      <td class="pv"><span class="mono">{N(r)}</span><div class="tbar"><div style="width:{pct:.1f}%"></div></div></td>
      <td class="jr">{juris}</td><td class="mono lc">{lic}</td></tr>\n'''

tier_cells = "".join(
    f'<div class="tier"><div class="tcount mono">{c}</div><div class="tlabel">{label} permits</div></div>'
    for label, c in tier_counts)

jbars = ""
jmax = max(juris_totals.values())
for j, c in sorted(juris_totals.items(), key=lambda kv: -kv[1]):
    jbars += f'''<div class="jrow"><div class="jname">{html.escape(j)}</div>
      <div class="btrack"><div class="bfill" style="width:{c / jmax * 100:.1f}%"></div>
      <span class="bval">{c}</span></div></div>\n'''

page = f"""<title>Tampa Bay Pool Builder Census</title>
<style>
:root {{
  --paper:#FAF9F5; --ink:#141413; --slate:#697485; --hairline:#D2D9E2;
  --accent:#00B6FF; --tint:#E5F4FF; --surface:#FFFFFF;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --paper:#141413; --ink:#FAF9F5; --slate:#9AA4B2; --hairline:#33363B;
    --accent:#00B6FF; --tint:#0E2A3A; --surface:#1C1D1F;
  }}
}}
:root[data-theme="dark"] {{
  --paper:#141413; --ink:#FAF9F5; --slate:#9AA4B2; --hairline:#33363B;
  --accent:#00B6FF; --tint:#0E2A3A; --surface:#1C1D1F;
}}
* {{ box-sizing:border-box; }}
body {{ background:var(--paper); color:var(--ink); margin:0;
  font-family:"Archivo","SF Pro Display",system-ui,helvetica,sans-serif;
  font-size:15px; line-height:1.55; }}
.mono {{ font-family:"Spline Sans Mono","SF Mono",menlo,monospace; font-variant-numeric:tabular-nums; }}
main {{ max-width:960px; margin:0 auto; padding:56px 28px 80px; }}
.eyebrow {{ font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--slate);
  font-weight:600; margin-bottom:14px; }}
h1 {{ font-size:clamp(30px,5vw,44px); font-weight:700; letter-spacing:-0.02em; line-height:1.05;
  margin:0 0 10px; text-wrap:balance; }}
.dek {{ color:var(--slate); max-width:62ch; margin:0 0 8px; }}
h2 {{ font-size:13px; letter-spacing:.12em; text-transform:uppercase; font-weight:700;
  margin:0 0 18px; padding-top:26px; border-top:1px solid var(--hairline); }}
section {{ margin-top:44px; }}
.tiles {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:0;
  border:1px solid var(--hairline); border-radius:6px; overflow:hidden; margin-top:36px; }}
.tile {{ padding:18px 20px 16px; background:var(--surface); border-left:1px solid var(--hairline); }}
.tile:first-child {{ border-left:none; }}
.tnum {{ font-size:32px; font-weight:700; letter-spacing:-0.02em; }}
.tnum em {{ font-style:normal; color:var(--accent); }}
.tsub {{ color:var(--slate); font-size:12.5px; margin-top:2px; }}
.brow,.jrow {{ display:grid; grid-template-columns:230px 1fr; gap:12px; align-items:center;
  padding:3px 0; }}
.bname,.jname {{ font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
.btrack {{ position:relative; height:16px; display:flex; align-items:center; }}
.bfill {{ height:12px; background:var(--accent); border-radius:0 3px 3px 0; min-width:2px; }}
.brow:hover .bfill,.jrow:hover .bfill {{ filter:brightness(.85); }}
.bval {{ font-family:"Spline Sans Mono",menlo,monospace; font-size:12px; margin-left:8px;
  color:var(--ink); font-variant-numeric:tabular-nums; }}
.tiers {{ display:grid; grid-template-columns:repeat(5,1fr); gap:1px; background:var(--hairline);
  border:1px solid var(--hairline); border-radius:6px; overflow:hidden; }}
.tier {{ background:var(--surface); padding:14px 16px; }}
.tcount {{ font-size:24px; font-weight:700; }}
.tlabel {{ font-size:12px; color:var(--slate); }}
.tablewrap {{ overflow-x:auto; border:1px solid var(--hairline); border-radius:6px; }}
table {{ border-collapse:collapse; width:100%; min-width:760px; background:var(--surface); }}
th {{ text-align:left; font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--slate); padding:10px 12px; border-bottom:1px solid var(--hairline); }}
td {{ padding:8px 12px; border-bottom:1px solid var(--hairline); vertical-align:top; font-size:13.5px; }}
tr:last-child td {{ border-bottom:none; }}
tr:hover td {{ background:var(--tint); }}
.rk {{ color:var(--slate); width:36px; }}
.nm {{ font-weight:600; }}
.pv {{ width:130px; }}
.tbar {{ height:4px; background:var(--tint); border-radius:2px; margin-top:5px; }}
.tbar div {{ height:4px; background:var(--accent); border-radius:2px; }}
.jr {{ color:var(--slate); font-size:12.5px; }}
.lc {{ font-size:12px; color:var(--slate); white-space:nowrap; }}
.note {{ color:var(--slate); font-size:13px; max-width:70ch; }}
.note strong {{ color:var(--ink); }}
ul.note {{ padding-left:18px; }} ul.note li {{ margin-bottom:6px; }}
footer {{ margin-top:56px; padding-top:18px; border-top:1px solid var(--hairline);
  color:var(--slate); font-size:12px; }}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=Spline+Sans+Mono:wght@400;600&display=swap">
<main>
  <div class="eyebrow">Pool Forge research · permit records, Sep 2024 to Aug 2026</div>
  <h1>Tampa Bay Pool Builder Census</h1>
  <p class="dek">Every residential pool permit filed in Hillsborough, Pinellas, and Pasco over 24 months,
  pulled from the counties' permit systems, deduped by contractor name and state license.
  Ranked by volume, this is the beta prospect list in call order.</p>

  <div class="tiles">
    <div class="tile"><div class="tnum"><em>{len(rows)}</em></div><div class="tsub">distinct licensed contractors pulled a pool permit</div></div>
    <div class="tile"><div class="tnum">{builders6}</div><div class="tsub">built at steady pace (6+ permits), the real builder market</div></div>
    <div class="tile"><div class="tnum">6,516</div><div class="tsub">residential pool permits across 22 jurisdictions</div></div>
    <div class="tile"><div class="tnum">{top10 / total_by_contractor * 100:.0f}%</div><div class="tsub">of attributed volume sits with the top 10 shops</div></div>
  </div>

  <section>
    <h2>Volume tiers · contractors by 24-month permit count</h2>
    <div class="tiers">{tier_cells}</div>
    <p class="note" style="margin-top:14px">The 195 one-permit entries are mostly GCs, custom home
    builders, and out-of-market firms, not pool companies. The sellable market is the
    {builders6} shops at 6+ permits; the {tier_counts[0][1]} shops at 24+ (a pool a month or better)
    are the ones with multiple designers and a live price-book problem.</p>
  </section>

  <section>
    <h2>Top 25 by permit volume</h2>
    {bar_rows}
  </section>

  <section>
    <h2>Where the permits are · attributed volume by jurisdiction</h2>
    {jbars}
    <p class="note" style="margin-top:14px">Another 1,473 permits have no machine-readable contractor:
    St. Petersburg (777) gates its records behind a login, and the smaller Pinellas cities
    (Largo, Dunedin, the beach towns) have no public detail pages. Their permits are counted
    above; their builders are undercounted in the rankings, mostly affecting Pinellas-only shops.</p>
  </section>

  <section>
    <h2>The call list · top 50</h2>
    <div class="tablewrap"><table>
      <thead><tr><th>#</th><th>Contractor</th><th>Permits</th><th>Footprint</th><th>License</th></tr></thead>
      <tbody>{table_rows}</tbody>
    </table></div>
    <p class="note" style="margin-top:12px">Full ranked list of all {len(rows)} contractors:
    <span class="mono">research/permit-census/out/contractor-census.csv</span> in the repo.</p>
  </section>

  <section>
    <h2>Method and caveats</h2>
    <ul class="note">
      <li><strong>Sources.</strong> Hillsborough County ArcGIS issued-permit layer + HillsGovHub detail pages;
      City of Tampa Accela (pool record type from Mar 2026, description-classified Miscellaneous records before);
      Pasco Accela RESPOOL records; Pinellas property appraiser countywide permit dump + Accela detail pages
      for County and Clearwater. One detail-page fetch per permit recovered the contractor and license.</li>
      <li><strong>Dedupe.</strong> Name normalization (suffixes, DBA, qualifier names) plus state license number,
      merged with union-find. 133 owner-builder permits excluded from company counts.</li>
      <li><strong>Dates.</strong> Hillsborough and Pinellas filter on true issue dates; Tampa and Pasco public
      search filters on application date, so edge months differ slightly and some in-review applications are included.</li>
      <li><strong>Not covered.</strong> Plant City, Temple Terrace, and Pasco's incorporated cities
      (New Port Richey, Zephyrhills, Dade City) run their own systems with no public feed; their volume is small
      and suburban unincorporated volume dominates new construction.</li>
    </ul>
  </section>

  <footer>Generated {date.today().isoformat()} · pipeline: research/permit-census/ (resumable; rerun fetch scripts + convert.py + census.mjs)</footer>
</main>
"""
open("out/census-page.html", "w").write(page)
print("wrote out/census-page.html", len(page), "bytes")
