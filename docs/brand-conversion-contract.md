# Brand conversion contract

The app is being moved onto `docs/brand-bible.md` one surface at a time, by
several people working in parallel. This file is what keeps those passes from
diverging or colliding. Read it before converting a screen.

## The state of play

| Surface | Status |
|---|---|
| `/product/*`, `/request-access` | Converted. They are the reference for what "done" looks like. |
| `src/components/ui/*` primitives | **Converted.** Button, card, input and label already speak brand tokens. |
| Everything under `(app)/` and `(auth)/` | Not converted. Still on the shadcn `--background` / `--pf-*` vocabulary. |
| Export documents (`src/modules/exports/`) | Not converted, and out of scope for a page pass. They are standalone printed HTML with their own inlined CSS. |

## The vocabulary

Tokens are on `:root` for every page (`src/styles/brand.css`, imported by
`globals.css`). Reach for the Tailwind utilities built from them:

```
bg-brand-orange   text-brand-green   bg-brand-blue        the five core hues
text-ink-slate    bg-ink-paper                            ink and neutrals
bg-tint-sand      bg-tint-ice        bg-tint-periwinkle   the twelve tints
text-theme-fg     text-theme-muted   text-theme-faint     follows the theme
bg-theme-bg       bg-theme-card      bg-theme-field
border-theme-line border-theme-lineSoft
bg-family-accent  bg-family-tint                          follows data-accent
shadow-elevation1 shadow-elevation2
rounded-brand     rounded-brand16    rounded-brand24
text-display1 … text-title1 … text-bodyL text-bodyS text-badge text-formLabel
font-display      font-brandMono     bg-rayFan
duration-brand    ease-brand
```

`src/lib/brand.ts` has the same palette as values, for three.js materials and
anything that cannot read a custom property.

## Rules

1. **Restyle, do not redesign.** Same information, same controls, same copy,
   same routes. If a screen genuinely needs different content, say so in the PR
   rather than doing it.
2. **The chassis is monochrome.** Black type, white ground, hairlines at 16%
   ink. Colour belongs to illustration, tints and the green bar — never to body
   text, borders or buttons.
3. **Derive, do not hard-code.** No new hex anywhere. Every surface, border and
   hover comes from `color-mix` off the theme foreground, or from a token.
4. **Mono means metadata.** Labels, badges, versions, dates, quantities, money.
   It never sets a sentence.
5. **Tighten as you scale up.** The `text-title*` and `text-display*` utilities
   already carry the right tracking; use them rather than sizing by hand.
6. **Two shadows exist.** Neither is a default. `elevation1` for a card whose
   affordance is softness rather than a border; `elevation2` for the single
   overlapping element in a composition.
7. **Keep the accessible names.** Labels, button text, headings and `data-testid`
   attributes are load-bearing for the e2e suite. Changing one is changing a
   test.

## Ownership, and what you must not touch

Each conversion owns its own route folder and the components used only by it.
**Do not edit these shared files** — a change there lands on every other pass at
once and turns a parallel job into a merge conflict:

- `src/styles/brand.css`
- `tailwind.config.ts`
- `src/app/globals.css`
- `src/components/ui/*`
- `src/lib/brand.ts`
- `src/app/(marketing)/**`

If your screen needs something from one of those, **stop and report it** rather
than editing it. A missing token is worth one round trip; eight people each
adding their own is not.

## Before you open a PR

- `pnpm typecheck` — clean, except the known pre-existing failure in
  `src/test/unit/voice/transcript.test.tsx`.
- `pnpm lint` — clean on files you touched.
- `pnpm build` — passes.
- `pnpm test` — no new failures. The 21 DB-backed failures are the baseline in a
  worktree with no Postgres; check the count has not gone up rather than
  expecting green.
- Look at the screen in a browser at 1440 and at 390. A conversion that has not
  been looked at is not a conversion.
