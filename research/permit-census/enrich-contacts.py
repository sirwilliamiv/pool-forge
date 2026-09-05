#!/usr/bin/env python3
"""Pull phone + email for the top census prospects from their own permit detail pages.

Usage: enrich-contacts.py [N]   (default top 60)
Reads out/contractor-census.csv + data/, refetches ONE recent detail page per
contractor (preferring sources that show email), writes out/prospects.csv.
"""
import csv, json, re, sys, time, html, urllib.request, urllib.parse, http.cookiejar

TOP_N = int(sys.argv[1]) if len(sys.argv) > 1 else 60
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def fetch(url, tries=3):
    for a in range(tries):
        try:
            r = op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90)
            return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("retry", a, e, file=sys.stderr, flush=True)
            time.sleep(3 * (a + 1))
    return None

def contact_block(p):
    m = re.search(
        r"tbl_licensedps.*?td_child_left'></td><td>(.*?)(?:<tr><td class='td_child_left'>|</table></span>)",
        p, re.S)
    if not m:
        return {}
    block = m.group(1)
    emails = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", block)
    phones = re.findall(r"ACA_PhoneNumberLTR\">\(?([\d)( -]{7,20})<", block)
    phones = [re.sub(r"[^\d]", "", x) for x in phones]
    phones = [f"({x[:3]}){x[3:6]}-{x[6:10]}" for x in dict.fromkeys(phones) if len(x) == 10]
    # mailing address: lines between company and the phone tables
    b2 = re.sub(r"<table.*?</table>", "\n", block, flags=re.S)
    lines = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.split(r"<br\s*/?>", b2)]
    lines = [x for x in lines if x]
    addr = [x for x in lines[2:6] if re.match(r"^(P\.?\s?O\.?|\d|[A-Z].*,\s*FL)", x, re.I) and "@" not in x]
    return {"email": (emails[0].lower() if emails else ""),
            "phones": " / ".join(phones[:2]),
            "mail_addr": ", ".join(addr[:2])}

# permit -> detail URL, per source
url_of = {}
for l in open("data/pasco_rows.jsonl"):
    r = json.loads(l)
    url_of[r["permit"]] = ("https://aca-prod.accela.com/PASCO/Cap/CapDetail.aspx?"
                           + r["detail_qs"].replace("&amp;", "&"))
for r in json.load(open("data/hillsborough_rows.json")):
    url_of[r["PERMIT__"]] = ("https://aca-prod.accela.com/HCFL/Cap/CapDetail.aspx?Module=Building&TabName=Building"
                             f"&capID1={r['CAPID1']}&capID2={r['CAPID2']}&capID3={r['CAPID3']}&agencyCode=HCFL")
for l in open("data/tampa_pool_rows.jsonl"):
    r = json.loads(l)
    url_of[r["permit"]] = "https://aca-prod.accela.com/TAMPA/Cap/CapDetail.aspx?" + r["detail_qs"]

PIN_ACA = {"Pinellas County (unincorporated + contract cities)": "PINELLAS", "Pinellas · Clearwater": "CLEARWATER"}
records = []
for f in ["pinellas", "pasco", "hillsborough", "tampa"]:
    records += json.load(open(f"data/census/{f}.json"))

PREFER = ["pcpao+aca", "pasco-aca", "hcfl-arcgis+aca", "tampa-aca"]  # email-rich first

rows = list(csv.DictReader(open("out/contractor-census.csv")))[:TOP_N]
out = []
for row in rows:
    lics = set(row["licenses"].split())
    aliases = set(a.strip() for a in row["name_variants"].split(" | ") if a.strip())
    mine = [r for r in records
            if (r["license"] and r["license"] in lics) or (r["contractor"] and r["contractor"].strip() in aliases)]
    mine.sort(key=lambda r: (PREFER.index(r["source"]) if r["source"] in PREFER else 9,
                             "" if not r["issuedDate"] else "z"), reverse=False)
    # newest within preferred source
    best = None
    for src in PREFER:
        cand = [r for r in mine if r["source"] == src and
                (src != "pcpao+aca" or r["jurisdiction"] in PIN_ACA) and
                (src == "pcpao+aca" or r["permitId"] in url_of)]
        if cand:
            best = max(cand, key=lambda r: r["issuedDate"] or "")
            break
    contact = {}
    if best:
        if best["source"] == "pcpao+aca":
            aca = PIN_ACA[best["jurisdiction"]]
            url = (f"https://aca-prod.accela.com/{aca}/Cap/GlobalSearchResults.aspx?QueryText="
                   + urllib.parse.quote(best["permitId"]))
        else:
            url = url_of[best["permitId"]]
        p = fetch(url)
        if p:
            contact = contact_block(p)
        time.sleep(0.3)
    rec = {"rank": row["rank"], "contractor": row["contractor"], "permits_24mo": row["permits_24mo"],
           "licenses": row["licenses"], "jurisdictions": row["jurisdictions"],
           "email": contact.get("email", ""), "phones": contact.get("phones", ""),
           "mail_addr": contact.get("mail_addr", ""),
           "sample_permit": best["permitId"] if best else ""}
    out.append(rec)
    print(f"{row['rank']:>3} {row['contractor'][:40]:42} {rec['phones']:28} {rec['email']}", flush=True)

with open("out/prospects.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
    w.writeheader()
    w.writerows(out)
print(f"wrote out/prospects.csv ({len(out)} prospects, "
      f"{sum(1 for r in out if r['email'])} with email, {sum(1 for r in out if r['phones'])} with phone)")
