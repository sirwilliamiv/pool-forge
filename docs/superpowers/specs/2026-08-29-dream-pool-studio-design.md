# Dream Pool Studio

A public, no-login pool configurator for homeowners, published at `/dream`. It is
a marketing tool shaped as a game: pick a budget, build a backyard, watch the
money move, and leave an address behind so a builder can quote it for real.

Net-new scope. Nothing in `docs/build-priority.md` covers marketing, so this is
a deliberate addition rather than an item pulled forward.

## Why this shape

The audience is homeowners, not builders, and that decides the mechanics.

- **Retention is worthless.** A homeowner buys a pool once. Daily-puzzle loops
  are the wrong target; optimise for completion and share rate.
- **The reveal is the hook.** The industry hides pool pricing. Every click that
  moves a number answers a question a homeowner cannot otherwise get answered
  without booking a salesman. That is the whole game.
- **A budget makes it a game.** Unlimited money is a toy. A bar that goes red is
  loss aversion, and loss aversion is what makes somebody replay.
- **The real share is one-to-one.** For a six-figure purchase the message is
  "look at this", sent to a partner, not broadcast. The primary call to action
  is therefore *send it to someone*, which is also the email capture.

## Honesty constraints

This shows money to a member of the public who is not a customer, so two rules
bind the whole feature:

1. **It is a ballpark, never a quote.** Output is a range with a stated basis.
   `REFERENCE_PRICE_NOTICE` is the single sentence that says so, and every
   surface that prints a number prints it.
2. **No gate in front of the number.** No email, address or signup before the
   reveal. Capture happens after, when the visitor wants to keep the thing.

The reference rates are their own list (`modules/dream/pricing.ts`), separate
from `STARTER_PRICE_LINES`. The starter book exists so a new builder's first
quote adds up and says outright that it is not market research; reusing it here
would put those placeholders in front of the public as if they were market rates.

## Architecture

The design is *parametric*, not drawn: a closed set of choices, not a shape
graph. That is the only way a configurator stays a 20-second experience. It
still runs on the real engines.

```
DreamConfig --measure.ts--> MeasurementSummary --computeQuote--> QuoteSummary
     |                       (real geometry)      (real pricing)       |
     +--nudges.ts--> what the design is missing            spread.ts   |
                                                    ballpark low/mid/high
```

- `config.ts` — `DreamConfig`, its Zod schema, and the default backyard.
- `catalog.ts` — the closed lists a homeowner picks from, with the footprint and
  the human blurb for each.
- `measure.ts` — `DreamConfig` to `MeasurementSummary`, using the same
  `src/lib/geometry` primitives `modules/measurements/engine.ts` uses. It does
  not build `Shape`s: a marketing page has no editor store, and the arithmetic
  that matters is in the shared primitives either way.
- `pricing.ts` — `REFERENCE_PRICE_LINES` plus `priceDream()`, which calls the
  real `computeQuote` and widens the point figure into a range.
- `spread.ts` — how wide the range is, and why. The spread is not a decorative
  plus-or-minus: it starts at the irreducible unknowns (site access, soil,
  permits, region) and widens with the scope this tool cannot see the site for.
- `nudges.ts` — homeowner-readable reactions ("that deck is tight for a pool
  that size"), the counterpart to the builder-facing validation dock.
- `share.ts` — a config encoded into a short URL-safe code, so a shared design
  needs no row and no signup. Decoding validates through the same Zod schema:
  the code is a URL, and a URL is a stranger's input.
- `lead/` — the one write. Mirrors `modules/waitlist/`: Zod schema, honeypot,
  per-address rate limit on the shared `RateLimitCounter`, thin route.

### Command registry

`CLAUDE.md` requires user actions to dispatch through `modules/commands/`. The
studio does not, and the reason is structural rather than convenience: a command
execution writes a `CommandAuditLog` row, and that row is org-scoped and
session-scoped. A visitor to `/dream` has neither. `WaitlistSignup` sits outside
the registry for the same reason and by the same argument. The lead endpoint is
therefore a thin route over `modules/dream/lead/`, validated with Zod at the
boundary like every other public endpoint here.

## Data

One model, `DreamDesign`: the config code, the ballpark it produced, an optional
email and postcode, and a source tag. No org, for the same reason
`WaitlistSignup` has none: the person has no builder yet.

## Testing

- Unit: measurement bridge, reference pricing, spread, nudges, share codec,
  lead handler.
- Property: adding scope never lowers the ballpark; `low <= mid <= high` for
  every reachable config; encode/decode round-trips; a decoded code never
  escapes the catalogue's closed lists.
