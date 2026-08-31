// Contractor-name normalization for the permit census.
// Permit systems store the same company as "TAMPA BAY POOLS, INC.", "Tampa Bay
// Pools Inc", "TAMPA BAY POOLS OF FL LLC", etc. We normalize to a canonical key
// so the dedupe counts one company once. License number, when present, is a
// stronger key than the name.

const SUFFIXES = [
  'INC', 'INCORPORATED', 'LLC', 'L L C', 'LC', 'CORP', 'CORPORATION', 'CO',
  'COMPANY', 'LTD', 'LIMITED', 'PA', 'PLLC', 'PL', 'ENTERPRISES', 'ENTERPRISE',
  'OF FLORIDA', 'OF FL', 'OF TAMPA', 'OF TAMPA BAY', 'USA', 'GROUP',
];

export function normalizeContractorName(raw) {
  if (!raw) return '';
  let s = String(raw).toUpperCase();

  // Drop qualifier-name prefixes like "SMITH JOHN A DBA ..." keeping the DBA name,
  // and "... DBA X" keeping X (the trade name is what Billy would call).
  const dba = s.split(/\bD\/?B\/?A\b/);
  if (dba.length > 1) s = dba[dba.length - 1];

  // Accela sometimes stores "COMPANY LLC/Qualifier Name" in the company field.
  // Keep the segment that looks like the business, not the person.
  if (s.includes('/')) {
    const segs = s.split('/').map((t) => t.trim()).filter(Boolean);
    const kw = /\b(POOL|POOLS|SPA|SPAS|CONSTRUCTION|BUILDERS?|CONTRACT\w*|INC|LLC|CORP|CO|COMPANY|ENTERPRISE\w*)\b/;
    const pick = segs.find((t) => kw.test(t)) ?? segs[0];
    if (pick.length >= 6 && pick.includes(' ')) s = pick;
  }

  s = s
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip corporate suffixes repeatedly ("... POOLS INC LLC" happens).
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      if (s.endsWith(' ' + suf)) {
        s = s.slice(0, -suf.length - 1).trim();
        changed = true;
      }
    }
  }

  // Collapse plural/singular of the one word that varies constantly, and the
  // "& Spas" tail that appears on and off for the same company.
  s = s.replace(/\bPOOL\b/g, 'POOLS');
  s = s.replace(/\bPOOLS AND SPAS?\b/g, 'POOLS').replace(/\s+/g, ' ').trim();

  return s;
}

export function normalizeLicense(raw) {
  if (!raw) return '';
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Only trust state contractor license shapes (CPC/CGC/CBC/CRC + digits, or SCC etc.)
  return /^[A-Z]{2,3}\d{5,}$/.test(s) ? s : '';
}
