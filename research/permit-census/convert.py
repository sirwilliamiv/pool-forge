#!/usr/bin/env python3
"""Merge raw permit rows + fetched contractor details into the census schema.

Reads the data/ intermediates, writes data/census/{pasco,hillsborough,pinellas,tampa}.json
in the shape census.mjs expects:
  { source, jurisdiction, permitId, issuedDate, type, description, contractor, license, address }
Withdrawn/abandoned applications are dropped. Pasco 'OIC' = owner-is-contractor.
"""
import json, re, os
from datetime import datetime, timezone

os.makedirs("data/census", exist_ok=True)

def mdy_to_iso(s):
    try:
        return datetime.strptime(s.strip(), "%m/%d/%Y").strftime("%Y-%m-%d")
    except Exception:
        return ""

def load_details(path):
    d = {}
    if os.path.exists(path):
        for l in open(path, encoding="utf-8"):
            r = json.loads(l)
            d[r["permit"]] = r
    return d

def contractor_of(det):
    if not det:
        return "", ""
    company = (det.get("company") or "").strip()
    person = (det.get("person") or "").strip()
    lic = (det.get("license") or "").strip()
    if company.upper() == "OIC" or det.get("owner_builder"):
        return "OWNER", ""
    return (company or person), lic

DROP_STATUS = re.compile(r"WITHDRAWN|ABANDONED|VOID|CANCEL", re.I)

# --- Pasco ---
det = load_details("data/pasco_details.jsonl")
out = []
for l in open("data/pasco_rows.jsonl", encoding="utf-8"):
    r = json.loads(l)
    if DROP_STATUS.search(r.get("status") or ""):
        continue
    name, lic = contractor_of(det.get(r["permit"]))
    out.append({"source": "pasco-aca", "jurisdiction": "Pasco County (unincorporated)",
                "permitId": r["permit"], "issuedDate": mdy_to_iso(r["date"]),
                "type": r["type"], "description": r.get("description", ""),
                "contractor": name, "license": lic, "address": r.get("address", "")})
json.dump(out, open("data/census/pasco.json", "w"))
print("pasco", len(out))

# --- Hillsborough County (unincorporated) ---
det = load_details("data/hcfl_details.jsonl")
NEG = re.compile(r"CAGE|SCREEN|ENCLOSURE|RESCREEN", re.I)
out = []
for r in json.load(open("data/hillsborough_rows.json")):
    if NEG.search(r.get("DESCRIPTION") or ""):
        continue
    name, lic = contractor_of(det.get(r["PERMIT__"]))
    iso = datetime.fromtimestamp(r["ISSUED_DATE"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d") if r.get("ISSUED_DATE") else ""
    out.append({"source": "hcfl-arcgis+aca", "jurisdiction": "Hillsborough County (unincorporated)",
                "permitId": r["PERMIT__"], "issuedDate": iso, "type": r.get("TYPE", ""),
                "description": r.get("DESCRIPTION", ""), "contractor": name, "license": lic,
                "address": f"{r.get('ADDRESS','')} {r.get('CITY','')}".strip()})
json.dump(out, open("data/census/hillsborough.json", "w"))
print("hillsborough", len(out))

# --- Pinellas (countywide index; contractor for County + Clearwater) ---
det = load_details("data/pinellas_details.jsonl")
out = []
for r in json.load(open("data/pinellas_pool_permits.json")):
    name, lic = contractor_of(det.get(r["permit"]))
    juris = {"County": "Pinellas County (unincorporated + contract cities)"}.get(
        r["agency"], f"Pinellas · {r['agency']}")
    out.append({"source": "pcpao+aca", "jurisdiction": juris, "permitId": r["permit"],
                "issuedDate": r["issued"], "type": "POOL", "description": "",
                "contractor": name, "license": lic, "address": ""})
json.dump(out, open("data/census/pinellas.json", "w"))
print("pinellas", len(out))

# --- Tampa ---
out = []
if os.path.exists("data/tampa_details.jsonl"):
    for l in open("data/tampa_details.jsonl", encoding="utf-8"):
        r = json.loads(l)
        if not r.get("is_pool"):
            continue
        if DROP_STATUS.search(r.get("status") or ""):
            continue
        name, lic = contractor_of(r)
        out.append({"source": "tampa-aca", "jurisdiction": "Tampa",
                    "permitId": r["permit"], "issuedDate": mdy_to_iso(r.get("date") or ""),
                    "type": "Residential Pool", "description": r.get("description", ""),
                    "contractor": name, "license": lic, "address": r.get("address", "")})
json.dump(out, open("data/census/tampa.json", "w"))
print("tampa", len(out))
