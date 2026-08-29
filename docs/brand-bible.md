# Brand Bible

**Visual identity · working reference**

The full system in one place: colour, typography, spacing and shape tokens, the
component inventory, and the four composition patterns that carry the
personality.

| | |
|---|---|
| Version | 0.1 draft |
| Updated | 29 Aug 2026 |
| Status | For review |

---

## Foundations

Two typefaces, one black-and-white chassis, and a set of themeable tokens that
flip the whole product by redefining eight values.

### Typefaces

| Role | Family | Stack |
|---|---|---|
| Interface & display | Display Sans (variable, self-hosted woff2) | `"Display Sans", "SF Pro Display", system-ui, helvetica, sans-serif` |
| Labels, data, code | Display Mono | `"Display Mono", "SF Mono", menlo, monospace` |

Both slots want a variable face. For the sans, a geometric-humanist grotesque
with a tall x-height; for the mono, something squarish and slightly wide so
labels read as data rather than as prose. The reference page is set in
**Instrument Sans** and **JetBrains Mono** as stand-ins.

#### Variable axes in use

| Axis | Token | Value | Where it shows up |
|---|---|---|---|
| Weight | `wght-regular` | 400 | Headlines, body copy |
| Weight | `wght-bold` | 600 | Emphasis |
| Weight | `wght-bolder` | 700 | Rare, badges |
| Width | `wdth-condensed` | 96 | Long headlines under pressure |
| Width | `wdth-narrow` | 98 | Nav, dense UI |
| Width | `wdth-normal` | 100 | Default |
| Slant | `slnt-italic` | −6 | Italic substitute |

Working weights sit between the named stops because the axis is interpolated:
nav and footer links at 320, lead paragraphs at 330, feature headings at 540.
Treat 320–340 as the real "regular" and 400 as "medium".

### Colour

The chassis is pure black on pure white. Every drop of colour is either one of
the five core hues or a soft accent tint.

#### Core spectrum

| Name | Hex |
|---|---|
| Orange | `#FF7237` |
| Red | `#FF3737` |
| Purple | `#874FFF` |
| Blue | `#00B6FF` |
| Green | `#24CB71` |

Green does double duty: it is the only core hue allowed to run full-bleed as a
surface, and it carries the product-wide announcement bar. The other four appear
almost exclusively inside the mark and inside illustration.

#### Ink & neutrals

| Name | Hex |
|---|---|
| True black | `#000000` |
| Warm ink | `#141413` |
| Slate text | `#697485` |
| Slate mist | `#D2D9E2` |
| Paper | `#FAF9F5` |
| White | `#FFFFFF` |

#### Accent tints

| Name | Hex | Name | Hex |
|---|---|---|---|
| Ice | `#C7F8FB` | Sand | `#FADCA2` |
| Pale blue | `#E5F4FF` | Blush | `#FFC9C1` |
| Mint | `#CFF7D3` | Lilac | `#CB9FD2` |
| Honeydew | `#F3FFE3` | Periwinkle | `#C4BAFF` |
| Sage | `#95B9AC` | Orchid | `#E28CF8` |
| Aqua | `#33DFDF` | UI blue | `#0D99FF` |

#### Theme tokens — light and dark from one set

| Token | Light | Dark | Note |
|---|---|---|---|
| `--theme-bg` | `#FFFFFF` | `#000000` | Page ground |
| `--theme-fg` | `#000000` | `#FFFFFF` | Primary text |
| `--theme-fg-muted` | fg @ 54% | fg @ 54% | Secondary text |
| `--theme-border` | fg @ 16% | fg @ 16% | Hairlines |
| `--theme-card-bg` | fg @ 4% | fg @ 8% | Raised surface |
| `--theme-btn-primary-bg` | `#000000` | `#FFFFFF` | Solid CTA |
| `--theme-btn-transparent-bg` | fg @ 4% | fg @ 4% | Quiet fill |
| `--theme-form-input-bg` | fg @ 8% | fg @ 8% | Fields |

The rule that makes this work: almost nothing is a literal colour. Every
surface, border and hover state is
`color-mix(in oklch, var(--fg), transparent N%)`, so inverting the theme means
swapping two hex values and the other thirty tokens follow.

### Accent families

Each surface — a product area, a marketing page, a campaign — keeps the
identical black-on-white chassis and changes only its tint family. That is the
entire differentiation system: no per-surface typeface, layout or button style.

| Family | Hues |
|---|---|
| Signal | `#24CB71` · `#33DFDF` · `#CB9FD2` |
| Azure | `#00B6FF` · `#C7F8FB` · `#0D99FF` |
| Vapour | `#00B6FF` · `#CFF7D3` |
| Drift | `#E5F4FF` · `#00B6FF` |
| Sandbar | `#FADCA2` · `#F3FFE3` · `#C7F8FB` |
| Dusk | `#CB9FD2` · `#C4BAFF` · `#95B9AC` |
| Sage | `#95B9AC` |
| Meadow | `#95B9AC` · `#F3FFE3` |
| Bloom | `#CB9FD2` · `#E28CF8` · `#FFC9C1` |
| Frost | `#C7F8FB` · `#D2D9E2` |
| Neutral | Docs & changelogs — `#697485` |
| **Inverse** (sub-brand) | `#252525` · `#F7FF9E` · `#AEB3A9` |

Reserve **Inverse** for something that is deliberately not part of the main
product line — a charcoal ground, an acid accent, its own type rendering. It is
a sub-brand, not a variant. If you are extending the system, do not reach for
it.

---

## Typography

A fifteen-step named scale, and one rule running through all of it: the bigger
the type, the tighter the tracking. Display sizes run to −1.25px of
letter-spacing; small labels open back out to +0.5px.

| Step | Size | Use |
|---|---|---|
| `display1` | 72px | "Prototype. Ship." |
| `display2` | 44px | "Design and explore" |
| `title1` | 36px | "Build and ship products" |
| `title2` | 32px | "Everything in one place" |
| `title3` | 24px | "Add context to the work" |
| `title4` | 22px | "Kits, packages and presets" |
| `bodyXL` | 18px | Lead paragraphs |
| `bodyL` | 16px | Body copy |
| `body` / `caption` | 14px | Dense copy, captions |
| `badge` | 12px mono | `CHANGELOG · NEW` |
| `formLabel` | 11px | Field labels |

### Leading & tracking tokens

| Line height | Value | Letter spacing | Value |
|---|---|---|---|
| `lh-none` | 1 | `ls-tight` | −1.25px |
| `lh-tight` | 1.1 | `ls-standard` | −0.66px |
| `lh-snug` | 1.2 | `ls-slight` | 0 |
| `lh-normal` | 1.3 | `ls-none` | 0 |
| `lh-relaxed` | 1.4 | `ls-wide` | +0.5px |
| `lh-loose` | 1.45 | | |

Working pairings: 44 / 48.4px at −0.66px; 30 / 36px at −0.66px; 16 / 23.2px at
−0.12px for nav and lead copy; mono labels at 12 / 12px with +0.6px. Mono always
takes positive tracking; sans display always takes negative.

---

## Space & shape

A thirteen-step spacing ramp that stays on multiples of four, eight radius
steps, and only two shadows in the entire system.

**Spacing ramp** — 4, 6, 8, 12, 16, 24, 32, 40, 56, 64, **80** (default section
block padding), **120** (major section break).

**Radius** — 2, 4, 8, 12, 16, 24, 28, full. In practice only four get used: 8px
for every button, 2–4px for chrome details, 16–24px for media cards and the
prompt field, and full for avatars and icon buttons.

**Elevation — both of them**

| Token | Value |
|---|---|
| `elevation-1` | `0 4px 32px rgba(0,0,0,.10)` |
| `elevation-2` | `0 24px 70px rgba(0,0,0,.10)` |

Both are the same 10% black, differing only in blur and offset. There is no mid
step and no coloured shadow anywhere in the system.

### Grid

| Token | Value | Meaning |
|---|---|---|
| `--max-content-width` | 1440px | Content cap for standard sections |
| `--grid-max-width` | 1520px | Cap for full-bleed grid sections |
| `--grid-columns` | 4 → 12 | Four on mobile, twelve at desktop |
| `--grid-gutter` | 16–24px | Gutter |
| `--grid-margin` | 16px | Outer margin |
| `--block-padding` | 80px | Vertical rhythm between blocks |

---

## Components

Small inventory, tightly specified. One button shape, one hairline, one green
bar.

### Buttons — 8px radius, 12 × 22 padding, 46px tall

| Property | Primary | Secondary | Transparent |
|---|---|---|---|
| Background | fg (solid) | none | fg @ 4% |
| Hover | fg @ 80% | fg @ 4% | fg @ 16% |
| Text | bg | fg | fg |
| Border | 0 | 1px fg @ 16% | 0 |
| Radius | 8px | 8px | 8px |
| Transition | `background .18s ease-out, box-shadow .18s ease-out` | | |

**Suggestion chips** — quiet pill-shaped filters.

**Prompt field** — 24px radius, hairline border, `elevation-1`, circular submit
at 38px. The only component in the system that uses a soft shadow as its primary
affordance rather than a border.

**Announcement bar — the one full-bleed colour.** Green `#24CB71`, black text at
16px, black pill button, dismiss × on the right. Pinned to the viewport bottom,
above the footer.

### Navigation

| Property | Value |
|---|---|
| Position | fixed, full width |
| Height | 72px |
| Background | `#FFFFFF`, no blur |
| Divider | 1px bottom hairline |
| Contents | mark left · primary CTA + hamburger right |
| Link weight | 320 at 16px, −0.12px tracking |

---

## Composition

This is where the identity actually lives. The tokens are almost aggressively
plain; the personality comes from four recurring ways of staging a product
screenshot.

**Picture-in-picture.** A full product screenshot forms the base plane; a
second, smaller real UI panel overlaps its lower-right corner and breaks the
frame edge. The inset always carries `elevation-2` — the only place the heavy
shadow is used — while the base plane stays flat. Reads as "here is the whole
tool, and here is the one feature we are talking about."

**Abstract accents.** Hard-edged flat shapes on white: squares with a
quarter-circle bitten out of one corner, squircles with opposing petals,
checkerboards, oversized numerals. No gradients, no shadows, no outlines.
Colours run full saturation — rust, orange, acid lime, magenta, cobalt — and
shapes overlap each other and crop off the viewport edge rather than sitting
politely inside it.

**Tint field backdrop.** A pastel block sits behind the lower two-thirds of the
screenshot so the card straddles the boundary between white and tint. Depth
comes from the overlap, not from shadow. The tint is always the surface's own
accent family, which is what makes each area feel distinct while the chassis
stays identical.

### Botanical accents

Two shapes, a **monstera leaf** and a **palm frond**, drawn to exactly the same
rules as the abstract accents above. They exist because this product is about
somebody's back yard, and the yard's own vocabulary is where a distinctive mark
comes from. They are a real risk: a pool company's marketing full of palm trees
is a cliché with a long and embarrassing history.

What keeps them out of that ditch is that **they are not illustration imported
into the system. They are the system, continued:**

- A **monstera** is a squircle with bites taken out of it. The fenestrations are
  the identical subtract operation this document already describes for the
  abstract accents; only the count and placement change.
- A **palm frond** is a radial array with the spokes tapered and swept — the ray
  fan's construction run along a curve instead of around a point. It is
  generated from a spine and a taper, not traced.

That derivation is the entry requirement. A third botanical shape is allowed
only if it can be built the same way, out of shapes already in the system. One
that has to be drawn from a photograph does not belong beside these.

**The rules, which are not negotiable:**

| | |
|---|---|
| **One flat colour** | No outline, no gradient, no shadow, no veins, no second tone. A silhouette. |
| **No trunk, ever** | The palm is a frond, not a tree. The trunk is precisely where this becomes a holiday brochure. |
| **Enormous and cropped** | One leaf spanning a third of the viewport, entering from an edge. Never centred, never whole, never small and sprinkled. |
| **Legible through the crop** | Crop hard, but not past the point where the shape still reads. A monstera cropped to nothing but its slits is an abstract gash, which is a different and worse thing. |
| **One accent language per composition** | Botanical *or* geometric. A checkerboard in the same frame as a frond reads as clip art added to a system. |
| **Green and the botanical tints only** | Green `#24CB71`, sage `#95B9AC`, mint `#CFF7D3`, honeydew `#F3FFE3`. Never brown. |

**Where they are allowed.** The front door and anything about the finished yard.
The product pages stay on the hard-edged geometry, because they are about the
tool rather than about the thing the tool makes. That split is the point: it
gives the botanicals a job instead of letting them spread until they are
wallpaper.

Implemented in `src/components/marketing/botanicals.tsx`.

**Conic ray fan.** A twelve-spoke starburst in the accent hue, used as a section
marker and behind icons. One declaration —
`repeating-conic-gradient(<accent> 0deg, <accent> 18deg, transparent 18deg, transparent 30deg)`
— with only the hue swapped per accent family.

### Motion — the pinned hero

Pages open with the headline pinned while the page scrolls beneath it: the
abstract shapes fly in from the crop edges, then the screenshot rises into place
and the shapes settle behind it. Everything else stays still. One orchestrated
moment at the top, then nothing — no scroll reveals down the page, no hover
animation beyond the 0.18s background fades on buttons.

---

## House rules

**Keep the chassis monochrome.** Black type, white ground, hairline borders at
16% ink. Colour is a guest: it belongs to illustration, tints and the green bar,
never to body text, borders or buttons.

**Differentiate with tint, not with structure.** Every surface shares one layout
system, one button, one type scale. A new area gets an accent family and nothing
else.

**Tighten as you scale up.** Negative tracking on everything above 24px, down to
−1.25px at display sizes. Positive tracking only on mono and uppercase labels.

**Let shapes overlap and crop.** Accent shapes should run off the edge of the
viewport and sit partly behind the screenshot. Contained, centred,
fully-visible decoration is the failure mode.

**Use shadow once per composition.** `elevation-2` belongs to the overlapping
element only. If two things in a frame have shadows, the hierarchy has already
collapsed.

**Mono means metadata.** The mono face appears only on labels, badges, version
numbers and dates. It never sets a sentence.

**Mix, don't hard-code.** Derive every surface, border and hover from the
foreground token with `color-mix`. Two hex values should be able to flip the
whole theme.

**Spend motion at the top.** One pinned, orchestrated hero. Below the fold,
nothing moves except 0.18s button fades.

---

## Token sheet

Drop-in starting point in plain CSS. Rename the prefix to match the codebase and
the rest maps cleanly.

```css
/* ---- core spectrum ---- */
--brand-orange: #FF7237;   --brand-red:    #FF3737;
--brand-purple: #874FFF;   --brand-blue:   #00B6FF;
--brand-green:  #24CB71;   --brand-ui-blue: #0D99FF;

/* ---- accent tints ---- */
--tint-ice: #C7F8FB;  --tint-pale-blue: #E5F4FF;  --tint-mint: #CFF7D3;
--tint-honeydew: #F3FFE3;  --tint-sage: #95B9AC;  --tint-sand: #FADCA2;
--tint-blush: #FFC9C1;  --tint-lilac: #CB9FD2;  --tint-periwinkle: #C4BAFF;
--tint-orchid: #E28CF8;  --tint-aqua: #33DFDF;  --tint-slate-mist: #D2D9E2;

/* ---- theme (light; dark swaps the two hex values) ---- */
--theme-bg:        #FFFFFF;
--theme-fg:        #000000;
--theme-fg-muted:  color-mix(in oklch, var(--theme-fg), transparent 46%);
--theme-border:    color-mix(in oklch, var(--theme-fg), transparent 84%);
--theme-card-bg:   color-mix(in oklch, var(--theme-fg), transparent 96%);
--theme-input-bg:  color-mix(in oklch, var(--theme-fg), transparent 92%);

/* ---- type ---- */
--font-sans: "Display Sans", "SF Pro Display", system-ui, helvetica, sans-serif;
--font-mono: "Display Mono", "SF Mono", menlo, monospace;
--size-display1: 4.5rem;   --size-display2: 2.75rem;
--size-title1: 2.25rem;    --size-title2: 2rem;
--size-title3: 1.5rem;     --size-title4: 1.375rem;
--size-bodyXL: 1.125rem;   --size-bodyL: 1rem;
--size-body: .875rem;      --size-badge: .75rem;
--size-formLabel: .6875rem;
--lh-none:1;  --lh-tight:1.1;  --lh-snug:1.2;
--lh-normal:1.3;  --lh-relaxed:1.4;  --lh-loose:1.45;
--ls-tight: -.078125rem;  --ls-standard: -.04125rem;  --ls-wide: .03125rem;

/* ---- space, radius, elevation ---- */
--space: 0 4 6 8 12 16 24 32 40 56 64 80 120 (px);
--radius: 2 4 8 12 16 24 28 9999 (px);
--elevation-1: 0 .25rem 2rem color-mix(in oklch, #000, transparent 90%);
--elevation-2: 0 1.5rem 4.375rem color-mix(in oklch, #000, transparent 90%);

/* ---- grid ---- */
--max-content-width: 1440px;   --grid-max-width: 95rem;
--grid-columns: 4 → 12;        --grid-gutter: 1rem;
--grid-margin: 1rem;           --block-padding: 5rem;

/* ---- signature effect ---- */
--ray-fan: repeating-conic-gradient(
    var(--accent) 0deg, var(--accent) 18deg,
    transparent 18deg, transparent 30deg);
```

---

## Status

Working draft. The palette, type scale and spacing ramp here are a starting
point derived from a competitive audit: swap the core spectrum, the two
typefaces and the accent families for Pool Forge's own before this ships as the
identity. The composition patterns, house rules and token architecture are the
parts worth keeping as-is.

### Where it is implemented

| File | What it holds |
|---|---|
| `src/styles/brand.css` | **The single definition of every value in this document.** Imported by `globals.css`, so the tokens are on `:root` for every page in the app, not just the marketing surface. |
| `tailwind.config.ts` | The same tokens as utilities: `bg-brand-orange`, `text-theme-muted`, `bg-tint-sand`, `bg-family-accent`, `shadow-elevation2`, `rounded-brand`, `text-title1`, `bg-rayFan`. Every entry points at a variable rather than repeating a hex. |
| `src/lib/brand.ts` | The palette as TypeScript, for the places that cannot read a CSS variable: three.js materials, export documents rendered standalone, anything handing a hex to a canvas or a PDF. |
| `src/app/(marketing)/marketing.css` | The marketing components and compositions only. It aliases the tokens; it defines none of them. |
| `src/test/unit/brand/tokens.test.ts` | Holds the three copies in sync, and fails if a value drifts, a family is added to one and not the other, or a token collides with a name shadcn already owns. |

Two naming notes, both learned by breaking something:

- The family tokens are `--family-accent` / `--family-tint` / `--family-tint-2`,
  not the bare `--accent` / `--tint` this document uses. `--accent` is already
  shadcn's, and Tailwind flattens its `@layer base` into plain rules, so
  `globals.css` silently won at `:root` and `var(--accent)` resolved to an HSL
  triplet instead of a colour. Inside `.mk` the short names are aliased back.
- Set the family with `data-accent="<name>"` on any wrapper, anywhere in the
  app. Everything inside it follows.

### What is not converted

The authenticated app still runs on the shadcn `--background` / `--foreground`
triplets and the `--pf-*` spec tokens in `src/app/globals.css`. Both systems
coexist on purpose, so screens can move over one at a time; the `--pf-*` set
goes away when the last screen stops using it.

| Surface | Accent family |
|---|---|
| `/product/editor` | Azure |
| `/product/quoting` | Sandbar |
| `/product/business` | Dusk |
