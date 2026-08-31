#!/usr/bin/env python3
"""Enrich City of Tampa permit rows with description + contractor from CapDetail.

Usage: fetch-tampa-details.py <tampa_pool_rows.jsonl> <tampa_miscna_rows.json> <out.jsonl>
Pool-type rows are pools by record type; Misc/NA rows are classified by the
detail page's Project Description. Resumable.
"""
import re, sys, json, time, html, urllib.request, urllib.parse, http.cookiejar
from pathlib import Path

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", UA)]

TAG = re.compile(r"<[^>]+>")
POOL_RE = re.compile(r"\b(POOL|SPA|SWIM|JACUZZI|HOT\s?TUB)", re.I)
NEG = re.compile(r"CAGE|SCREEN|ENCLOSURE|RESCREEN", re.I)

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

def parse_description(p):
    i = p.find("Project Description:")
    if i < 0:
        return ""
    txt = html.unescape(TAG.sub("\n", p[i:i + 2000]))
    lines = [l.strip() for l in txt.splitlines() if l.strip()]
    return lines[1] if len(lines) > 1 else ""

def fetch(url, tries=3):
    for a in range(tries):
        try:
            r = op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90)
            return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("retry", a, e, file=sys.stderr, flush=True)
            time.sleep(4 * (a + 1))
    return None

jobs = []
for l in open(sys.argv[1], encoding="utf-8"):
    r = json.loads(l)
    jobs.append({"permit": r["permit"], "status": r["status"], "address": r["address"],
                 "date": r["date"], "typed_pool": True,
                 "url": "https://aca-prod.accela.com/TAMPA/Cap/CapDetail.aspx?" + r["detail_qs"]})
for r in json.load(open(sys.argv[2])):
    jobs.append({"permit": r["Record Number"], "status": r.get("Status", ""),
                 "address": r.get("Address", ""), "date": r.get("Date", ""), "typed_pool": False,
                 "url": "https://aca-prod.accela.com/TAMPA/Cap/GlobalSearchResults.aspx?QueryText="
                        + urllib.parse.quote(r["Record Number"])})

out_path = Path(sys.argv[3])
done = set()
if out_path.exists():
    for l in open(out_path, encoding="utf-8"):
        try:
            done.add(json.loads(l)["permit"])
        except Exception:
            pass
print(f"{len(jobs)} jobs, {len(done)} already fetched", flush=True)

out = open(out_path, "a", encoding="utf-8")
todo = [j for j in jobs if j["permit"] not in done]

import threading
from concurrent.futures import ThreadPoolExecutor

lock = threading.Lock()
count = [0]

def work(j):
    p = fetch(j["url"])
    rec = {"permit": j["permit"], "status": j["status"], "address": j["address"], "date": j["date"]}
    if p is None:
        rec["error"] = "fetch_failed"
    else:
        desc = parse_description(p)
        rec["description"] = desc
        rec["is_pool"] = bool(j["typed_pool"] or (POOL_RE.search(desc) and not NEG.search(desc)))
        if rec["is_pool"]:
            rec.update(parse_licensed(p))
            if not rec.get("company") and not rec.get("person") and "OWNER-BUILDER" in p.upper():
                rec["owner_builder"] = True
    with lock:
        out.write(json.dumps(rec) + "\n")
        out.flush()
        count[0] += 1
        if count[0] % 50 == 0:
            print(f"fetched {count[0]}/{len(todo)} (last: {j['permit']} pool={rec.get('is_pool')} -> {rec.get('company') or rec.get('person') or ''})", flush=True)
    time.sleep(0.15)

with ThreadPoolExecutor(max_workers=4) as ex:
    list(ex.map(work, todo))
out.close()
print(f"DONE fetched={count[0]}")
