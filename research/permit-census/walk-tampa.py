#!/usr/bin/env python3
"""Walk City of Tampa ACA building-permit search results; write rows to JSONL.

Usage: walk-tampa.py <permit_type> <start MM/DD/YYYY> <end MM/DD/YYYY> <out.jsonl> [--count-only]
"""
import re, sys, json, time, html, urllib.request, urllib.parse, http.cookiejar

BASE = "https://aca-prod.accela.com/TAMPA/Cap/CapHome.aspx?module=Building&TabName=Building"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", UA)]

def hidden(p):
    f = {}
    for m in re.finditer(r'<input[^>]+type=["\']hidden["\'][^>]*>', p):
        t = m.group(0)
        n = re.search(r'name=["\']([^"\']+)["\']', t)
        v = re.search(r'value=["\']([^"\']*)["\']', t)
        if n:
            f[n.group(1)] = html.unescape(v.group(1)) if v else ""
    return f

def pb(page, target, extra=None, tries=3):
    post = hidden(page)
    post["__EVENTTARGET"] = target
    post["__EVENTARGUMENT"] = ""
    if extra:
        post.update(extra)
    data = urllib.parse.urlencode(post).encode()
    for a in range(tries):
        try:
            req = urllib.request.Request(BASE, data=data, headers={
                "User-Agent": UA,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": BASE})
            return op.open(req, timeout=180).read().decode("utf-8", "replace")
        except Exception as e:
            print("retry", a, e, file=sys.stderr, flush=True)
            time.sleep(4)
    raise RuntimeError("postback failed")

SPAN = r'{id}">([^<]*)</span>'
def cell(chunk, name):
    m = re.search(r'_%s">([^<]*)</span>' % name, chunk)
    return html.unescape(m.group(1)).strip() if m else ""

def parse_rows(p):
    rows = []
    for chunk in re.split(r'<tr[^>]*class="ACA_TabRow', p)[1:]:
        qs = re.search(r'CapDetail\.aspx\?([^"]+)"', chunk)
        num = cell(chunk, "lblPermitNumber1")
        if not qs or not num:
            continue
        rows.append({
            "date": cell(chunk, "lblUpdatedTime"),
            "permit": num,
            "type": cell(chunk, "lblType"),
            "address": cell(chunk, "lblAddress") or cell(chunk, "lblPermitAddress"),
            "status": cell(chunk, "lblStatus"),
            "shortNote": cell(chunk, "lblShortNote"),
            "detail_qs": html.unescape(qs.group(1)),
        })
    return rows

def next_target(p):
    i = p.find("aca_pagination")
    seg = p[i:i + 6000]
    m = re.search(r"__doPostBack\(&#39;([^&]+)&#39;,&#39;&#39;\)[^>]*>\s*Next", seg)
    return m.group(1) if m else None

ptype, start, end, outfile = sys.argv[1:5]
count_only = "--count-only" in sys.argv

page = op.open(BASE, timeout=90).read().decode("utf-8", "replace")
p = pb(page, "ctl00$PlaceHolderMain$btnNewSearch", {
    "ctl00$PlaceHolderMain$ddlSearchType": "0",
    "ctl00$PlaceHolderMain$generalSearchForm$ddlGSPermitType": ptype,
    "ctl00$PlaceHolderMain$generalSearchForm$txtGSStartDate": start,
    "ctl00$PlaceHolderMain$generalSearchForm$txtGSEndDate": end,
})

out = open(outfile, "w")
n_pages = total = 0
while True:
    n_pages += 1
    rows = parse_rows(p)
    for r in rows:
        out.write(json.dumps(r) + "\n")
    total += len(rows)
    m = re.search(r"Showing\s+(\d+)-(\d+)\s+of\s+([\d+]+)", p)
    print(f"page {n_pages}: {len(rows)} rows ({m.group(0) if m else '??'}) total={total}", flush=True)
    if count_only and n_pages >= 1:
        break
    nt = next_target(p)
    if not nt or n_pages >= 1500:
        break
    time.sleep(0.4)
    p = pb(p, nt)
out.close()
print(f"DONE pages={n_pages} rows={total}")
