#!/usr/bin/env python3
"""Enrich Pasco ACA pool-permit rows with contractor info from CapDetail pages.

Usage: fetch-pasco-details.py <pool_rows.jsonl> <out_details.jsonl>
Resumable: permits already present in the output file are skipped.
"""
import re, sys, json, time, html, urllib.request, http.cookiejar
from pathlib import Path

DETAIL = "https://aca-prod.accela.com/PASCO/Cap/CapDetail.aspx?"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", UA)]

TAG = re.compile(r"<[^>]+>")

def parse_licensed(p):
    """First licensed professional block: person, company, license."""
    m = re.search(
        r"tbl_licensedps.*?td_child_left'></td><td>(.*?)(?:<tr><td class='td_child_left'>|</table></span>)",
        p, re.S)
    if not m:
        return {}
    block = m.group(1)
    # Phones live in nested tables; cut them out before line-splitting.
    block = re.sub(r"<table.*?</table>", "\n", block, flags=re.S)
    lines = [html.unescape(TAG.sub("", x)).strip()
             for x in re.split(r"<br\s*/?>", block)]
    lines = [x for x in lines if x]
    person = lines[0] if lines else ""
    person = re.sub(r"\S+@\S+", "", person).strip()  # strip email
    company = lines[1] if len(lines) > 1 else ""
    if re.match(r"^(P\.?\s?O\.?\s?BOX|\d)", company, re.I):
        company = ""  # second line was already the street address
    lic = ""
    lm = re.search(r"\b([A-Z]{2,3}\d{5,8})(?:-\d+)?\b", block)
    if lm:
        lic = lm.group(1)
    return {"person": person, "company": company, "license": lic}

def fetch(url, tries=3):
    for a in range(tries):
        try:
            r = op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90)
            return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("retry", a, e, file=sys.stderr, flush=True)
            time.sleep(4 * (a + 1))
    return None

rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8")]
out_path = Path(sys.argv[2])
done = set()
if out_path.exists():
    for l in open(out_path, encoding="utf-8"):
        try:
            done.add(json.loads(l)["permit"])
        except Exception:
            pass
print(f"{len(rows)} rows, {len(done)} already fetched", flush=True)

out = open(out_path, "a", encoding="utf-8")
todo = []
for r in rows:
    if r["permit"] in done:
        continue
    todo.append((r["permit"], DETAIL + r["detail_qs"].replace("&amp;", "&"), {"permit": r["permit"]}))

def extract(p, rec):
    return parse_licensed(p)

import threading
from concurrent.futures import ThreadPoolExecutor

lock = threading.Lock()
count = [0]

def work(item):
    permit, url, base = item
    p = fetch(url)
    rec = dict(base)
    if p is None:
        rec["error"] = "fetch_failed"
    else:
        rec.update(extract(p, rec))
    with lock:
        out.write(json.dumps(rec) + "\n")
        out.flush()
        count[0] += 1
        if count[0] % 50 == 0:
            print(f"fetched {count[0]}/{len(todo)} (last: {permit} -> {rec.get('company') or rec.get('person') or rec.get('error') or ''})", flush=True)
    time.sleep(0.15)

with ThreadPoolExecutor(max_workers=4) as ex:
    list(ex.map(work, todo))
out.close()
print(f"DONE fetched={count[0]}")
