# Marketing engine

Outbound machine built on the permit census (`research/permit-census/`). The
target market is 121 Tampa Bay builders at 6+ permits/24mo; the founding beta
needs 10 of them. Everything here is generated from their own permit records,
so every touch opens with a fact about their business.

## Pieces

| Piece | What it is | Rebuild |
|---|---|---|
| `research/permit-census/out/prospects.csv` | Top 60 with phone, email, mailing address scraped from their permit filings (46 emails, 49 phones) | `python3 research/permit-census/enrich-contacts.py 60` |
| `marketing/outreach/NN-<company>.md` | Per-prospect kit: 3-email sequence + call script, personalized with their volume, rank, and county footprint | `python3 marketing/generate-outreach.py` |
| `marketing/call-sheet.csv` | Dial-order sheet with the opener stat line per company | same |
| Pipeline board (artifact "Beta Outreach Pipeline") | Working cockpit: status funnel, live-saved status + notes per prospect, one-click prefilled email drafts, call opener copy | `python3 marketing/build-pipeline-page.py`, republish artifact |

## Cadence (per prospect, top of the list first)

1. Day 0: email 1 (the permit-stat opener). Send from the pipeline board's
   "Open email draft" button; mark Emailed.
2. Day 2: call. Script and opener are on the card; mark Called, note who answered.
3. Day 4: email 2 (reply in same thread, the one-question email).
4. Day 7: second call attempt.
5. Day 10: email 3 (break-up). Mark Passed or keep working it.
6. Demo booked: 15 minutes, screen share, use one of THEIR permits' pool
   descriptions as the demo design. Beta close: free seat, hands-on setup
   (docs/beta-operations.md is the runbook; invites are manual).

## Constraints and notes

- No mail provider is wired up, so sends are manual (mailto drafts). If reply
  volume justifies it, wire a provider and this same data feeds the sequences.
- Emails/phones came from public permit filings; some are permitting-desk
  addresses (e.g. permitting@, accounting@). Those are still fine openers:
  ask the desk who runs design/quoting.
- Monday.com board version is blocked until the account admin enables
  "Public Hosted MCP"; the artifact board covers it meanwhile.
- St. Petersburg-heavy builders are underrepresented (their permit records are
  login-gated); the census README has the coverage caveats.
