#!/usr/bin/env python3
"""Enrich Pinellas pool permits (County + Clearwater agencies) with contractor info.

Usage: fetch-pinellas-details.py <pinellas_pool_permits.json> <out_details.jsonl>
Lookup: GET GlobalSearchResults.aspx?QueryText=<permit#> on the issuing agency's
ACA instance; it 302s to CapDetail. Resumable.
"""
import re, sys, json, time, html, urllib.request, urllib.parse, http.cookiejar
from pathlib import Path

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", UA)]

AGENCY_ACA = {"County": "PINELLAS", "Clearwater": "CLEARWATER"}
TAG = re.compile(r"<[^>]+>")

def parse_licensed(p):
    m = re.search(
        r"tbl_licensedps.*?td_child_left'></td><td>(.*?)(?:<tr><td class='td_child_left'>|</table></span>)",
        p, re.S)
    if not m:
        return {}
    block = m.group(1)
    block = re.sub(r"<table.*?</table>", "\n", block, flags=re.S)
    lines = [html.unescape(TAG.sub("", x)).strip() for x in re.split(r"<br\s*/?>", block)]
    lines = [x for x in lines if x]
    person = re.sub(r"\S+@\S+", "", lines[0]).strip() if lines else ""
    company = lines[1] if len(lines) > 1 else ""
    if re.match(r"^(P\.?\s?O\.?\s?BOX|\d)", company, re.I):
        company = ""
    lic = ""
    lm = re.search(r"\b([A-Z]{2,3}\d{5,8})(?:-\d+)?\b", block)
    if lm:
        lic = lm.group(1)
    return {"person": person, "company": company, "license": lic}

def fetch(url, tries=3, data=None, referer=None):
    for a in range(tries):
        try:
            h = {"User-Agent": UA}
            if referer:
                h["Referer"] = referer
                h["Origin"] = "https://aca-prod.accela.com"
                h["Content-Type"] = "application/x-www-form-urlencoded"
            r = op.open(urllib.request.Request(url, data=data, headers=h), timeout=120)
            return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("retry", a, e, file=sys.stderr, flush=True)
            time.sleep(4 * (a + 1))
    return None

def hidden(p):
    f = {}
    for m in re.finditer(r'<input[^>]+type=["\']hidden["\'][^>]*>', p):
        t = m.group(0)
        n = re.search(r'name=["\']([^"\']+)["\']', t)
        v = re.search(r'value=["\']([^"\']*)["\']', t)
        if n:
            f[n.group(1)] = html.unescape(v.group(1)) if v else ""
    return f

def form_search(aca, permit):
    """Fallback: CapHome permit-number search -> CapDetail link -> direct GET."""
    base = f"https://aca-prod.accela.com/{aca}/Cap/CapHome.aspx?module=Building&TabName=Building"
    page = fetch(base)
    if page is None:
        return None
    f = hidden(page)
    f.update({"__EVENTTARGET": "ctl00$PlaceHolderMain$btnNewSearch", "__EVENTARGUMENT": "",
              "ctl00$PlaceHolderMain$ddlSearchType": "0",
              "ctl00$PlaceHolderMain$generalSearchForm$txtGSPermitNumber": permit})
    p = fetch(base, data=urllib.parse.urlencode(f).encode(), referer=base)
    if p is None:
        return None
    m = re.search(r'CapDetail\.aspx\?[^"]+', p)
    if not m:
        return None
    return fetch(f"https://aca-prod.accela.com/{aca}/Cap/" + html.unescape(m.group(0)))

rows = json.load(open(sys.argv[1]))
rows = [r for r in rows if r["agency"] in AGENCY_ACA]
out_path = Path(sys.argv[2])
done = set()
if out_path.exists():
    for l in open(out_path, encoding="utf-8"):
        try:
            done.add(json.loads(l)["permit"])
        except Exception:
            pass
print(f"{len(rows)} lookup rows, {len(done)} already fetched", flush=True)

out = open(out_path, "a", encoding="utf-8")
n = 0
for r in rows:
    if r["permit"] in done:
        continue
    aca = AGENCY_ACA[r["agency"]]
    url = (f"https://aca-prod.accela.com/{aca}/Cap/GlobalSearchResults.aspx?QueryText="
           + urllib.parse.quote(r["permit"]))
    p = fetch(url)
    if p is not None and "tbl_licensedps" not in p:
        p = form_search(aca, r["permit"]) or p
    rec = {"permit": r["permit"], "agency": r["agency"]}
    if p is None:
        rec["error"] = "fetch_failed"
    elif "tbl_licensedps" not in p:
        rec["error"] = "not_found"
    else:
        rec.update(parse_licensed(p))
    out.write(json.dumps(rec) + "\n")
    out.flush()
    n += 1
    if n % 25 == 0:
        print(f"fetched {n} (last: {r['permit']} -> {rec.get('company') or rec.get('person') or rec.get('error')})", flush=True)
    time.sleep(0.35)
out.close()
print(f"DONE fetched={n}")
