// Aggregates fetched permit records into the contractor census.
// Input: data/*.json — arrays of records:
//   { source, jurisdiction, permitId, issuedDate (ISO), type, description,
//     contractor, license, address }
// Output: out/contractor-census.csv and out/report.md, ranked by permit volume.
//
// Dedupe strategy: union-find. Every record links its normalized contractor
// name and its license number; any shared license or shared normalized name
// merges the groups. Owner-builder and blank-contractor permits are counted
// separately, not as companies.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeContractorName, normalizeLicense } from './normalize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data', 'census');
const OUT = path.join(ROOT, 'out');

const OWNER_RE = /\b(OWNER|HOMEOWNER|OWNER\s*\/?\s*BUILDER)\b/;

// --- union-find ---
const parent = new Map();
function find(x) {
  if (!parent.has(x)) parent.set(x, x);
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r);
  let c = x;
  while (parent.get(c) !== c) { const n = parent.get(c); parent.set(c, r); c = n; }
  return r;
}
function union(a, b) { parent.set(find(a), find(b)); }

const records = [];
for (const f of (await readdir(DATA)).filter((f) => f.endsWith('.json'))) {
  const arr = JSON.parse(await readFile(path.join(DATA, f), 'utf8'));
  if (!Array.isArray(arr)) throw new Error(`${f}: expected an array`);
  for (const r of arr) records.push(r);
}
if (records.length === 0) {
  console.error('No records in data/. Run the fetch-*.mjs scripts first.');
  process.exit(1);
}

// De-duplicate permits themselves (a permit can appear in two source layers).
const seenPermit = new Set();
const permits = [];
for (const r of records) {
  const key = `${r.jurisdiction}|${r.permitId}`;
  if (seenPermit.has(key)) continue;
  seenPermit.add(key);
  permits.push(r);
}

let ownerBuilder = 0;
let noContractor = 0;
const keyed = [];
for (const r of permits) {
  let name = normalizeContractorName(r.contractor);
  // Some systems store a bare license number in the company field; that's not a name.
  if (/^[A-Z]{2,3}\d{5,}$/.test(name)) name = '';
  const lic = normalizeLicense(r.license);
  if (!name && !lic) { noContractor++; continue; }
  if (OWNER_RE.test(name) && name.split(' ').length <= 3) { ownerBuilder++; continue; }
  const nameKey = name ? `n:${name}` : null;
  const licKey = lic ? `l:${lic}` : null;
  const primary = licKey ?? nameKey;
  if (nameKey && licKey) union(nameKey, licKey);
  keyed.push({ r, primary, name, lic });
}

const groups = new Map();
for (const k of keyed) {
  const root = find(k.primary);
  if (!groups.has(root)) {
    groups.set(root, {
      names: new Map(), rawNames: new Map(), licenses: new Set(),
      jurisdictions: new Map(), permits: [], first: null, last: null,
    });
  }
  const g = groups.get(root);
  if (k.name) g.names.set(k.name, (g.names.get(k.name) ?? 0) + 1);
  const raw = (k.r.contractor ?? '').trim();
  if (raw && !/^[A-Za-z]{2,3}\d{5,}$/.test(raw)) g.rawNames.set(raw, (g.rawNames.get(raw) ?? 0) + 1);
  if (k.lic) g.licenses.add(k.lic);
  g.jurisdictions.set(k.r.jurisdiction, (g.jurisdictions.get(k.r.jurisdiction) ?? 0) + 1);
  g.permits.push(k.r);
  const d = k.r.issuedDate?.slice(0, 10) ?? '';
  if (d) {
    if (!g.first || d < g.first) g.first = d;
    if (!g.last || d > g.last) g.last = d;
  }
}

const mostCommon = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
const rows = [...groups.values()]
  .map((g) => ({
    name: mostCommon(g.rawNames) || mostCommon(g.names),
    permits: g.permits.length,
    licenses: [...g.licenses].join(' '),
    jurisdictions: [...g.jurisdictions.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([j, n]) => `${j}:${n}`)
      .join('; '),
    first: g.first ?? '',
    last: g.last ?? '',
    aliases: [...g.rawNames.keys()].join(' | '),
  }))
  .sort((a, b) => b.permits - a.permits || a.name.localeCompare(b.name));

await mkdir(OUT, { recursive: true });

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [
  'rank,contractor,permits_24mo,licenses,jurisdictions,first_permit,last_permit,name_variants',
  ...rows.map((r, i) =>
    [i + 1, r.name, r.permits, r.licenses, r.jurisdictions, r.first, r.last, r.aliases]
      .map(esc).join(',')),
].join('\n');
await writeFile(path.join(OUT, 'contractor-census.csv'), csv + '\n');

const juris = new Map();
for (const p of permits) juris.set(p.jurisdiction, (juris.get(p.jurisdiction) ?? 0) + 1);
const companyPermits = rows.reduce((s, r) => s + r.permits, 0);
const cum = (n) => {
  let s = 0, i = 0;
  for (const r of rows) { s += r.permits; i++; if (i === n) break; }
  return ((s / companyPermits) * 100).toFixed(0);
};
const md = `# Tampa Bay residential pool contractor census

Window: last 24 months of issued residential pool permits. Generated ${new Date().toISOString().slice(0, 10)}.

## Headline
- **${rows.length} distinct pool contractors** pulled at least one residential pool permit
- ${permits.length} pool permits total; ${companyPermits} by contractors, ${ownerBuilder} owner-builder, ${noContractor} with no contractor recorded
- ${rows.filter((r) => r.permits >= 24).length} companies at 1+/month pace (24+ permits), ${rows.filter((r) => r.permits >= 12).length} at 12+, ${rows.filter((r) => r.permits >= 6).length} at 6+
- Top 10 companies hold ${cum(10)}% of contractor volume; top 25 hold ${cum(25)}%; top 50 hold ${cum(50)}%

## Permits by jurisdiction
${[...juris.entries()].sort((a, b) => b[1] - a[1]).map(([j, n]) => `- ${j}: ${n}`).join('\n')}

## Top 50 by volume (the call list)
| # | Contractor | Permits | Jurisdictions | License |
|---|---|---|---|---|
${rows.slice(0, 50).map((r, i) => `| ${i + 1} | ${r.name} | ${r.permits} | ${r.jurisdictions} | ${r.licenses} |`).join('\n')}

Full list: contractor-census.csv
`;
await writeFile(path.join(OUT, 'report.md'), md);

console.log(`permits: ${permits.length} (${ownerBuilder} owner-builder, ${noContractor} no-contractor)`);
console.log(`distinct contractors: ${rows.length}`);
console.log(`top 10:`);
for (const r of rows.slice(0, 10)) console.log(`  ${String(r.permits).padStart(4)}  ${r.name}`);
console.log(`wrote out/contractor-census.csv and out/report.md`);
