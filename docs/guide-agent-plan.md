# The guide — plan

> **Status, 2026-08-29.** Not built. This is the design, for review.

A voice companion that explains the screen somebody is looking at and shows them
where things are. It points; it never does the work for them.

It is not a second agent. It is a **mode** of the voice agent that already
exists, with a tool surface that cannot write.

## What already exists

Most of the machinery is in place, which is why this is a smaller job than it
sounds.

- **A live audio agent.** `gemini-live-2.5-flash-native-audio` through
  `src/modules/voice`, mounted as `VoiceDock` in the `(app)` layout, so it is
  already on every authenticated page.
- **Per-screen scoping.** `scope.ts` already decides what the agent may do based
  on the route. A guide mode is a new scope, not a new mechanism.
- **A generic page reader.** `page.read` walks the live DOM for headings,
  sections, labelled values and available buttons. Explaining what is on screen
  needs no per-page authoring.
- **A proven way to point at something.** `ImportReviewScreen.jumpTo` resolves a
  stable DOM id, scrolls it to centre, focuses it, and **falls back to the
  containing group when the exact field is not mounted.** That fallback is the
  part worth keeping: a guide that cannot find the precise control should still
  land the user in the right region rather than do nothing.

And the parts that do not:

- **No inventory of what the app offers.** `editor/tools/index.ts` catalogues 59
  editor tools with eleven fields each, but they are implementation facts:
  inputs, outputs, side effects, undo behaviour. None of them say where the tool
  is, how to reveal it, or how to explain it to a person. It is also editor
  only.
- **48 of those 59 are `status: 'planned'`.** The file's own comment records
  that this already caused harm once: the catalogue described tools that did not
  exist and its voice examples taught the agent to ask for them.

## The one rule

**The guide may change what is visible. It may never change what is stored.**

Opening a panel, switching a tab, scrolling, selecting an object so its
inspector appears: all visibility. Setting a depth, importing a price, deleting
a shape: not the guide's job, ever, even when asked directly.

This is mechanical rather than a line in a prompt. The guide's tool surface is
built from an allowlist, and a test asserts that nothing in it writes. Adding a
writing command to the guide scope has to fail a named test.

## The inventory

One entry per thing a user can reach. Hand-written, because the three fields
that matter cannot be derived from the DOM: where it lives in a person's mental
model, what sequence reveals it, and what it is for in a pool builder's words.

```ts
interface GuideEntry {
  id: string
  /** Never point at something that is not there. Mirrors ToolStatus. */
  status: 'built' | 'planned'
  screen: GuideScreen
  name: string
  /** Where it is, in the words someone would use. "Right inspector, Specs tab." */
  where: string
  /** Ordered steps that reveal it. Every step is a reveal, never a write. */
  openPath: string[]
  /** How the guide finds it. A stable id or data-guide attribute, not a class. */
  anchor: string
  /** The containing region, used when `anchor` is not mounted. */
  fallbackAnchor?: string
  /** Plain English: what it is for, and what it changes downstream. */
  explain: string
  /** For "what would this change", never for calling. */
  relatedCommands?: string[]
}
```

### Coverage

Every page, not the editor alone. In rough order of how lost somebody gets:

| Screen | Route | Notes |
|---|---|---|
| Editor | `/projects/[id]/editor` | The big one. Toolbar, stencil palette, inspector tabs, layers, grade, validation. |
| Import review | `/projects/[id]/import` | Already has the anchor pattern to generalise. |
| Price book | `/settings/price-book` | Versions, change requests, the import entry point. |
| Price book import | `/settings/price-book/import` | Column mapping is the least self-explanatory screen in the product. |
| Project detail | `/projects/[id]` | Status, customer, the routes out to documents. |
| Dashboard | `/dashboard` | Creating a project, the status filters, the setup checklist. |
| Proposal | `/projects/[id]/proposal` | What the customer sees, and what acceptance means. |
| Construction set | `/projects/[id]/construction` | |
| Site plan | `/projects/[id]/site-plan` | |
| Screen enclosure quote | `/projects/[id]/screen-enclosure-quote` | |
| Company settings | `/settings/company` | The fields that print on documents. |
| Team | `/settings/team` | Inviting, roles. |
| Customer uploads | `/settings/intake` | |
| Docs | `/docs/tools`, `/docs/commands` | |

Creating a project is a dialog rather than a route, and dialogs need entries
too: an affordance that only exists after a click is exactly what a newcomer
cannot find.

## The agent's tools

A new `guide` command category, client-run, registered like everything else
because `CLAUDE.md` requires it.

- **`guide.find`** — given what the user asked about, return matching entries
  with their `where` and `explain`. Answering "where do I change the depth"
  needs no DOM at all.
- **`guide.reveal`** — walk an entry's `openPath` so the thing becomes visible.
  Refuses any step that is not a reveal.
- **`guide.show`** — scroll the anchor into view and border it, falling back to
  `fallbackAnchor`. This is `jumpTo`, generalised.

The guide scope is those three plus `page.read` and `navigation`. Not
`page.click`, not `page.fill`, not any mutating category.

## Highlighting

Reuse the existing look rather than invent one: the accent border already used
for an active row (`border-pfAccent`, `bg-pfAccentSoft`), applied to the target,
plus `scrollIntoView({ block: 'center' })`.

- The border is a decoration on top, never a layout change, so nothing reflows
  when the guide points at something.
- Respect `prefers-reduced-motion` for the scroll.
- Clear on the next utterance, on navigation, and on any click, so a stale
  border never outlives the sentence it belonged to.

## How it stays true

The inventory will rot. That is the main risk, and it is the same risk the tool
catalogue already realised once.

**A test resolves every `built` entry against the running app.** Playwright
visits each screen, walks each entry's `openPath`, and asserts the anchor
exists. An entry whose anchor has moved fails by name. This mirrors the existing
tools-versus-toolbar test that exists for exactly this reason.

`planned` entries are excluded from the guide surface entirely, so an
aspirational entry cannot be pointed at.

## Open, and worth deciding before building

1. **The relay has no host.** Per `voice-agent-plan.md`, the web build needs
   `services/voice-relay` deployed plus `VOICE_TICKET_SECRET` and
   `NEXT_PUBLIC_VOICE_RELAY_URL`. **Voice does not work in the deployed app
   today.** The guide inherits that, so shipping it means deploying the relay
   first. The inventory and the highlighting are useful without audio; the audio
   is what makes it a companion.
2. **Public pages.** `VoiceDock` is in the `(app)` layout, so `/login` and
   `/request-access` have no companion. Adding it there means unauthenticated
   Gemini sessions, which needs its own rate limit and spend ceiling.
3. **Cost.** Native-audio Live sessions are metered per minute and `VoiceSession`
   already records usage. A guide invites longer sessions than a command agent
   does, because explaining takes longer than doing.
