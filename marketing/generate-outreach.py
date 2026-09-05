#!/usr/bin/env python3
"""Generate personalized outreach kits from the permit census prospect list.

Reads research/permit-census/out/prospects.csv, writes:
  marketing/outreach/NN-<slug>.md   (email sequence + call script per prospect)
  marketing/call-sheet.csv          (dial-order sheet with the opener stat line)
Run from repo root: python3 marketing/generate-outreach.py
"""
import csv, os, re

SRC = "research/permit-census/out/prospects.csv"
OUT = "marketing/outreach"
os.makedirs(OUT, exist_ok=True)

def clean_name(raw):
    if "/" in raw:
        head, tail = raw.split("/", 1)
        if not re.search(r"\b(INC|LLC|CORP|POOL|SPA)\b", tail.upper()) and len(head) >= 8:
            raw = head
    name = raw.strip().title()
    for a, b in [("Llc", "LLC"), ("Inc.", "Inc"), ("'S", "'s"), ("Of ", "of "), ("And ", "and ")]:
        name = name.replace(a, b)
    return re.sub(r"[,.]+$", "", name)

def counties_of(juris):
    seen = []
    for part in juris.split("; "):
        j = part.rpartition(":")[0]
        c = ("Hillsborough" if "Hillsborough" in j else
             "Pasco" if "Pasco" in j else
             "Pinellas" if "Pinellas" in j or "Clearwater" in j or "St Pete" in j else
             "Hillsborough" if j == "Tampa" else None)
        if c and c not in seen:
            seen.append(c)
    return seen

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]

rows = list(csv.DictReader(open(SRC)))
call_sheet = []
for r in rows:
    n = int(r["permits_24mo"])
    name = clean_name(r["contractor"])
    counties = counties_of(r["jurisdictions"])
    cty = (counties[0] if len(counties) == 1
           else " and ".join(counties) if len(counties) == 2
           else ", ".join(counties[:-1]) + ", and " + counties[-1])
    per_mo = n / 24
    pace = (f"about {per_mo:.0f} pools a month" if per_mo >= 1.5
            else "better than a pool a month" if n >= 24
            else f"{n} pools in two years")
    stat = f"{n} residential pool permits across {cty} in the last 24 months"
    multi = n >= 24

    email1 = f"""Subject: {n} permits, {len(counties)} count{"ies" if len(counties) > 1 else "y"}, one price book?

Hi,

Public permit records show {name} pulled {stat}. That's {pace}, which usually means several designers quoting at once{" across county lines" if len(counties) > 1 else ""}.

I'm building Pool Forge, design and quoting software made for exactly that shop: draw the pool over a satellite image of the customer's yard, your price book prices it while you draw, and a clean quote PDF comes out the other end. No more re-pricing a design in a spreadsheet after the design meeting.

I'm onboarding ten Tampa Bay builders as founding beta users. Free during beta, set up hands-on, and the roadmap gets shaped by your quoting workflow, not a corporate one.

Worth a 15-minute look this week?

Billy
Pool Forge, Tampa
pool-forge.com"""

    email2 = f"""Subject: Re: {n} permits, one price book?

Hi,

Quick follow-up. The reason I reached out to {name} specifically: of the 440 companies that pulled a pool permit in Tampa Bay in the last two years, you're #{r['rank']} by volume. High-volume shops are the ones where quoting speed and price consistency actually move margin.

One question is all I need: when a designer finishes a layout today, how long until the customer has a priced quote in hand?

If the answer is "same meeting," I'll stop emailing. If it's "days," that's the gap Pool Forge closes.

Billy"""

    email3 = f"""Subject: closing the loop

Hi,

Last note from me. The founding beta is capped at ten builders and I'm filling it from the top of the Tampa Bay volume list, so I wanted to give {name} the first look before I move down the list.

If the timing's wrong, no hard feelings. If a designer on your team should see it instead, happy to show them directly.

Billy"""

    script = f"""Opener: "Hi, this is Billy, I build software for pool builders here in Tampa. Do you have 60 seconds? ... I was going through county permit records and {name} came up with {stat}. Who does the design and quoting when a lead comes in, you or a design team?"

Discovery:
1. "When a designer finishes a layout, how does it get priced? Spreadsheet, software, somebody's head?"
2. "{"With several designers quoting, " if multi else ""}How do you keep pricing consistent when costs change, gunite, travel, pavers?"

Pitch (one breath): "Pool Forge is design plus quoting in one tool: draw the pool on the customer's actual yard from satellite, your price book prices it live, quote PDF at the end of the design meeting. I'm putting ten Tampa Bay builders in a free founding beta and setting each one up personally."

Close: "Can I get 15 minutes with you {"or one of your designers " if multi else ""}this week to show it on one of your real designs?"

Objections:
- "We use Pool Studio / Structure Studios" -> "That's design. Where does pricing live? The gap between the drawing and the quote is what I close."
- "Too busy" -> "That's the point. You quoted {pace}; I save time on every one. 15 minutes."
- "Send info" -> get the email, send sequence email 1, book follow-up call before hanging up."""

    kit = f"""# {r['rank']}. {name}

| | |
|---|---|
| Volume | {n} permits / 24 mo (rank #{r['rank']} of 440) |
| Footprint | {r['jurisdictions']} |
| License | {r['licenses']} |
| Phone | {r['phones'] or 'not on permits, look up'} |
| Email | {r['email'] or 'not on permits, look up'} |
| Mail | {r['mail_addr'] or ''} |
| Source permit | {r['sample_permit']} |

Status: [ ] not contacted   [ ] emailed   [ ] called   [ ] demo booked   [ ] beta   [ ] pass

## Email 1 (day 0)

{email1}

## Email 2 (day 4, reply in thread)

{email2}

## Email 3 (day 10, reply in thread)

{email3}

## Call script

{script}
"""
    fname = f"{OUT}/{int(r['rank']):02d}-{slug(name)}.md"
    open(fname, "w").write(kit)
    call_sheet.append({"rank": r["rank"], "company": name, "phone": r["phones"],
                       "email": r["email"], "permits_24mo": n,
                       "opener_stat": stat, "kit": fname})

with open("marketing/call-sheet.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(call_sheet[0].keys()))
    w.writeheader()
    w.writerows(call_sheet)
print(f"wrote {len(rows)} kits to {OUT}/ and marketing/call-sheet.csv")
