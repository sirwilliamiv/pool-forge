# Voice agent — plan

`CLAUDE.md` says the command registry exists so the app is "voice-ready without a
rewrite". This is the collection on that bet: **60 of the 64 registered commands
already carry `voiceExamples`, a Zod input schema, and a real `execute`.** The
voice layer is mostly a translation problem, not a new feature surface.

Three capabilities, in the order they should be built:

1. **Navigate** — "go to the price book", "open the Whitfield job"
2. **Operate the current page** — "add a paver deck", "set the length to 32 feet"
3. **Build a pool start to finish** — the whole editor, by voice

## The shape of it

```
mic ─► browser ─(ws)─► Pool Forge server ─(ws)─► Gemini Live on Vertex
                              │                         │
                              │◄──── function call ──────┘
                              ▼
                    /api/commands dispatch
                    (Zod validation + CommandAuditLog)
                              │
                              ▼
                     UI updates, tool result returned
```

Everything the model can do, it does by calling a command that already exists. No
second execution path, so voice inherits validation, org scoping, the audit log,
and undo for free.

## Tools are generated, never hand-written

A converter turns each registered command into a Gemini `FunctionDeclaration`:
`id` becomes the name, `description` and `voiceExamples` become the description,
and the Zod `inputSchema` becomes the parameter schema.

**The known trap:** per the global note, Gemini's JSON-Schema subset cannot express
recursive or polymorphic shapes and silently emits `{}` for the affected fields.
So the converter validates every generated declaration against a flat-schema check
and **refuses** to publish one it cannot express, logging at `warn` with the command
id. A command that cannot be described is simply not offered by voice, which is
honest; a silently mangled one would let the model call it with garbage.

## Page-scoped tool sets

The model is given only the tools that are valid where the user actually is —
`nav.*` everywhere, plus the categories that page owns:

| Where | Categories offered |
|---|---|
| Anywhere | `navigation` |
| Dashboard | `project` |
| Price book | `pricing` |
| Editor | `canvas`, `shape`, `measurement`, `pricing`, `validation`, `scene`, `template` |
| Import review | `import` |
| Project page | `export`, `project` |

This is deliberate: an unavailable tool cannot be called, so an out-of-scope
request fails as "I can't do that here" rather than as a confusing error from a
command that should not have run.

## Navigation is its own command category

New `navigation` category, registered like everything else:

| command | notes |
|---|---|
| `nav.goto` | destination is an **enum**, not free text, so the model cannot invent routes |
| `nav.openProject` | by name; resolves server-side, org-scoped, asks when ambiguous |
| `nav.back` | |
| `nav.setView` | plan / 3D / section |
| `nav.setMode` | plan / design / build / customer |
| `nav.focus` | highlight a panel or field, for "highlight the quote" |

## Credentials stay on the server

The Live API is a WebSocket, and Vertex auth is ADC, which must never reach a
browser. So the browser connects to **our** server and the server holds the Gemini
session. Two consequences worth deciding up front:

- Next.js route handlers do not serve WebSockets. This needs either a custom
  server entry or a small separate ws process. That is the main infrastructure
  decision in this plan.
- `wss://` must be added to the CSP `connect-src` in the same commit as the client.
  `https://` does not cover WebSocket connections, and the failure is silent.

## Rules this must not break

- **`AudioContext` is created inside the click handler**, never on mount. Browsers
  block autoplay and the failure is silent.
- **Vertex only.** These are customer job details; the consumer endpoint permits
  training on prompts.
- **Destructive commands need spoken confirmation.** Voice misrecognition plus
  `template.scene.apply --replace` or a delete is how someone loses a drawing. The
  same gate the import flow uses: name what will be destroyed, require a yes.
- **Every dispatch is audited** with `source: 'voice'`, so "what did the user
  actually do" survives the interface changing.
- Raw provider errors never reach the UI; wrap with an `err_<12 hex>` ref.

## Build order

Each step is useful on its own and testable without the one after it.

1. **Registry → tool declarations**, with the flat-schema guard and unit tests.
   No audio involved; assert the 60 commands convert or are refused for a stated
   reason.
2. **`navigation` category** — real commands, dispatched from the existing UI
   first, so "go to the price book" works from the command palette before it works
   by voice.
3. **Page-scoped tool sets** plus a `useVoiceScope()` hook each route declares.
4. **The transport** — ws relay, session lifecycle, mic capture, playback.
5. **The editor agent** — build a pool by voice, which by then is just step 3
   pointed at the editor's categories.

Steps 1 to 3 are the substance and carry no infrastructure risk. Step 4 is where
the real decisions are.
