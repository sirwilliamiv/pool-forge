# Marco builds your first pool — guided training

**Status:** design, pending review
**Date:** 2026-09-05

## Goal

A new user watches Marco build one complete pool project end to end, so they
see how the whole workflow fits together before they touch anything: draw the
pool, set the shallow and deep ends, add a spa, steps and a drain, place the
house, draw the property line and a setback, add a fence, turn on grade, and
watch the live quote move. It ends with a finished, measured, priced job.

The point is comprehension, not automation. Every action is one the user could
do themselves; the training just performs them in order, slowly, naming each
one, so the user learns the vocabulary of the product by watching.

## Settled decisions

- **Watch me.** Marco performs each step itself; the user watches. (Not a
  do-it-yourself tutorial — that is a possible follow-up, "now you try.")
- **Throwaway sandbox.** It builds in a real but disposable "Training" project,
  so every command runs normally against a real project id and the user's own
  work is never touched. At the end it offers "Discard" or "Keep."
- **Scripted, not improvised.** The sequence and the narration are fixed data,
  not the model deciding what to do. It is identical and correct every run.
- **Captions, no live model.** Narration is pre-written caption text shown in a
  Marco caption bar, spoken aloud via the voice session / TTS when it is on but
  requiring no Gemini call and working with the mic off — exactly like the
  existing tour mode. The training never depends on a live voice session and
  costs nothing to run.
- **Human-paced, anticipation first.** Every step announces before it acts, with
  a deliberate pause, so nothing is a surprise. See Pacing.

## The pacing model (the load-bearing UX requirement)

Each step runs in **two beats** so the human always sees *what* and *where*
before it happens:

1. **Announce** — highlight the exact control (`guide.point`) and show/speak
   Marco's line for what he is about to do. **Hold ~2.5s** so the eye finds the
   highlight and the intent registers.
2. **Act** — dispatch the command that performs the action. **Hold ~1.5s** on
   the result before the next step begins.

So no step is faster than ~4 seconds. Rules:

- **Auto-advance** at that pace, with a **Pause** control and **Next / Back** so
  the user can dwell on any step as long as they want, or step through by hand.
- **Never fire a command the instant a step starts** — the announce beat always
  comes first.
- **Next skips the current wait** for users who want to move faster.
- Honor `prefers-reduced-motion`: no camera swoops or animated transitions
  during holds; the highlight and caption are enough.
- Timings are named constants (`ANNOUNCE_HOLD_MS = 2500`, `ACT_SETTLE_MS = 1500`)
  so they are tunable in one place after we watch a real person follow it.

## The script (data)

A single ordered array of steps. Each step is declarative:

```ts
interface TrainingStep {
  /** What Marco says while announcing this step. One or two short sentences. */
  say: string
  /** Controls to highlight during the announce beat (guide target ids). */
  point?: GuideTargetId[]
  /** The command performed in the act beat. Omit for a pure-narration step. */
  run?: { command: string; input: unknown }
  /** Override the default settle after the action (e.g. longer to read a quote). */
  settleMs?: number
}
```

The first-pool script, in order (each `run` is an existing registered command;
`point` uses existing `GUIDE_TARGETS`):

1. **Intro** (narration only) — "I'll build a complete pool so you can see how
   the pieces fit. Watch — I'll say each thing before I do it."
2. **Draw the pool** — point `panel.stencils` / the pool tool → `add.shape`
   (RECTANGLE_POOL). "First the pool itself."
3. **Set the deep end** — point `panel.layers`/inspector → `pool.geometry.update`
   (shallow 3 ft, deep 8 ft). "Every pool has a shallow and a deep end — here's
   three feet down to eight."
4. **Add a spa** — point stencils → add spa stencil. "A raised spa, spilling
   into the pool."
5. **Add steps** — add a step/bench stencil. "Steps into the shallow end."
6. **Add a drain** — add a deco-drain stencil. "A deck drain along the edge."
7. **Place the house** — add a house-wall structure. "This is the house the
   pool sits behind."
8. **Property line + setback** — draw the lot boundary and a required setback.
   "The lot line, and the setback the county requires from it."
9. **Add a fence** — add a fence line. "Pool code needs a barrier — here's the
   fence."
10. **Grade the site** — point `panel.grade` → `grade.enable` + a couple of
    `grade.point.add`. "The ground isn't flat — here's how it falls, and the
    dirt that has to move."
11. **The price moved** (narration, point the live quote) — "Notice the price
    has been climbing the whole time. Every shape you saw added its own line."
12. **Wrap** (narration) — "That's a complete job: measured, priced, ready to
    send. This was a practice project — discard it, or keep it to build on."

Exact stencil ids and command inputs are pinned when the script file is written,
each verified against the registry so a step cannot silently dispatch a command
that does nothing.

## The runner

A small client component, `FirstPoolTraining`, mounted in the editor. It:

- Holds `stepIndex` and a `paused` flag.
- For each step: dispatch `guide.point` with the step's targets, render the
  caption, wait `ANNOUNCE_HOLD_MS` (unless Next/paused), dispatch `run` through
  the command registry, wait `settleMs ?? ACT_SETTLE_MS`, advance.
- Renders a fixed **caption bar** (Marco persona) with the current line, a
  **step counter** ("4 / 12 — adding the spa"), and **Pause / Next / Back /
  Stop** controls.
- On **Stop** or Escape: clears the highlight (`guide.clear`), ends, and offers
  the discard/keep choice.
- Speaks the caption via the existing voice/TTS path only if a session is
  active; otherwise silent captions.

Everything the runner does goes through the command registry, so every training
action is audited exactly like a real one, and the whole build is one the user
could reproduce by hand.

## The sandbox project

- Start: `create.project` named e.g. "Training — practice pool", flagged so it
  can be told apart (a name convention is enough; no schema change needed).
- The runner navigates into that project's editor and runs the script there.
- End: a small panel — **"Discard training project"** (deletes it via the
  existing `deleteProject`) or **"Keep it."** Discard is the default framing.
- Guardrail: the training only ever creates/writes/deletes the project it made;
  it never touches an existing one.

## Entry points

- A **"Watch Marco build a pool"** row on the `FirstRunChecklist` for new
  accounts.
- A matching prompt in an **empty editor** ("New here? Watch me build one.").
- Both are one click: create the sandbox → open its editor → start the runner.

## What this reuses vs. what's new

Reuses: `guide.point` / `guide.clear` + `GuideHighlight` (highlighting), the
whole command registry (every build action), the Marco caption/voice path
(narration), `create.project` / `deleteProject` (sandbox). No new command
categories, no schema change.

New: the script (data file), the `FirstPoolTraining` runner component, the two
entry-point buttons, and a tiny "training in progress" caption/controls UI.

## Testing

- **Unit:** the script is valid — every `run.command` is a registered command
  whose input passes that command's `inputSchema`, and every `point` id is a
  real `GUIDE_TARGETS` id. (This is the "a step cannot silently do nothing"
  guard, as a test.)
- **Unit:** the runner's step machine — announce-before-act ordering, Pause
  holds, Next skips the wait, Stop clears the highlight and ends.
- **E2E:** start the training from the checklist → it creates a sandbox project,
  runs to completion, the editor shows a pool with a spa and a non-zero quote,
  and Discard removes the project.

## Open items / non-goals

- **Non-goal (v1):** the "now you try" interactive half. This spec is watch-only;
  hybrid is a clean follow-up once the script and runner exist.
- **Camera:** the script may want to `view.fit` or snap the camera between steps
  so the new object is on screen; kept minimal and reduced-motion-safe.
- **Voice:** if a live Marco session is connected, whether it should also be
  interruptible by the user asking a question mid-training is deferred.
