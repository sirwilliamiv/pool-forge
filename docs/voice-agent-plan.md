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
mic ─► browser ─(ws)─► relay ─(ws)─► Gemini Live on Vertex
         ▲                              │
         └────── forwarded toolCall ────┘
         │
         └─► the browser's existing dispatch(): store + /api/commands + audit
```

Everything the model can do, it does by calling a command that already exists, and
the **browser** is what runs it. No second execution path, so voice inherits
validation, org scoping, the audit log and undo for free, and the screen updates
the moment the command lands rather than after a refetch. Step 4 argues this
properly.

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

## Step 4 in detail: the transport

### The browser cannot talk to Vertex, and that is settled

The SDK is explicit: **"Ephemeral auth tokens is only supported in the Gemini
Developer API."** Vertex has no equivalent, and Vertex is mandatory here because
these are customer job details and the consumer endpoint permits training on
prompts. Vertex auth is ADC, which must never reach a browser.

So a relay is not a preference between two designs. It is the only shape this can
take, and the remaining decisions are about where it runs and what it carries.

### The browser executes the tools, not the server

The relay's job is audio and routing. It never touches the database.

```
mic ──audio──► relay ──audio──► Gemini Live (Vertex)
                 ▲                    │
                 │                toolCall
                 │                    ▼
 browser ◄───forwarded toolCall────── relay
    │
    ├─ dispatch() → zustand updates instantly, /api/commands writes the audit row
    └─ result ──► relay ──sendToolResponse──► Gemini
```

This is the part worth arguing for. The obvious design has the relay execute
commands server-side, and it is wrong twice over: the editor's state lives in a
client store, so a server-side write would leave the screen stale until something
refetched; and it would create a second execution path alongside the existing
`dispatch()`, so voice would quietly miss whatever the client path does.

Letting the browser execute keeps **exactly one execution path**, gives instant UI
feedback because the store updates before the model has finished speaking, and
reduces the relay to a pipe with no database access, no Prisma client, and no
org-scoping logic of its own to get wrong.

### Where it runs, and when that changes

Written as a transport-agnostic module, mounted initially in a **custom Next
server** that handles the `upgrade` event.

That choice is about auth more than convenience: a same-origin upgrade carries the
session cookie, so `auth()` validates the handshake before a Gemini session is ever
opened, and `orgId` is bound to the socket for its lifetime. A separate service
would have to re-implement session validation to get the same guarantee.

It should not stay there forever. Voice sessions are long-lived, stateful and
memory-heavy; HTTP instances autoscale on request count and are recycled freely, so
a scale-down or a deploy drops live calls. **The trigger for extracting it into its
own service** is concrete: when a deploy dropping in-flight calls stops being
acceptable, or when concurrent sessions per instance start competing with request
traffic for memory. Writing it standalone from the start makes that a deployment
change rather than a rewrite.

Cloud Run terminates a request at its configured timeout, so the relay must survive
that boundary by design rather than by hoping calls are short. Session resumption
below is what makes that survivable.

### Session lifecycle

The Live API ends sessions on its own schedule and says so first:
`LiveServerGoAway.timeLeft` is a warning, not a disconnect. The SDK exposes
`sessionResumption: { handle, transparent: true }`.

So the relay opens with resumption enabled, keeps the handle, and on `GoAway` or a
dropped socket reconnects with it. The handle stays server-side; the browser never
sees one and never manages reconnection. To the user a session that resumes is a
session that did not end. `contextWindowCompression` handles the long-conversation
case so a builder who talks for twenty minutes does not fall off the context window
mid-job.

### Audio

- **In:** mic → `AudioWorklet` → PCM16 mono 16 kHz → ~20-40 ms frames → binary
  frames on the socket. Not `MediaRecorder`: the Live API wants raw PCM, and webm
  would mean transcoding on the way through.
- **Out:** PCM16 24 kHz → ring buffer → `AudioWorklet` playback.
- **`AudioContext` is constructed inside the click handler.** Browsers block
  autoplay and the failure is silent, so a context created on mount produces a
  session that looks connected and plays nothing.
- **Barge-in:** on `interrupted`, flush the playback queue immediately. A model that
  keeps talking over a user who has started speaking feels broken within one turn.
- **Backpressure:** if the upstream stalls, drop the oldest frames rather than
  buffering. Audio is only useful fresh, and an unbounded buffer turns a hiccup into
  a permanently drifting conversation.

### Scope enforcement is the relay's, not the model's

The model is offered a page-scoped tool set, but the relay **re-checks every tool
call against that same scope** before forwarding it. A model that hallucinates a
tool name, or reaches for one from a page the user has since left, gets a refusal
rather than a dispatch. Never trust the caller to stay inside the surface it was
handed.

Destructive commands do not dispatch on first hearing. The relay refuses and tells
the model to confirm with the user out loud, naming what will be lost, and only
dispatches after an explicit confirmation. This is the same gate the import flow
uses, for the same reason: voice misrecognition plus `apply --replace` is how a
drawing disappears.

### Cost and abuse

Audio tokens are expensive and a session bills continuously while it is open, so
this needs a ceiling before it needs polish:

- A per-org cap on concurrent sessions, and on minutes per day.
- Backed by an **atomic DB counter**, not an in-memory one. N instances each
  enforcing a local limit collectively allow N times the intended ceiling.
- At the cap the session ends with a spoken explanation rather than a dead socket.

### Failure modes it has to handle

| Failure | Behaviour |
|---|---|
| ADC lapses mid-session | Refresh; on failure end the session with a spoken error and an `err_<hex>` ref |
| Gemini 429 or 5xx | Bounded retry with backoff; say what happened rather than going silent |
| Mic permission denied | Never open a session; explain in the UI |
| Network drop | Reconnect with the resumption handle |
| Deploy during a call | Drain: stop accepting new sessions, let live ones finish |
| Model calls an out-of-scope tool | Refuse at the relay, tell the model why |

### What gets verified before this is called done

- A tool call round-trips end to end and the editor updates without a refetch.
- A session survives a forced `GoAway` via the resumption handle.
- Barge-in cuts playback inside one turn.
- The concurrency cap actually holds with two instances running.
- No raw provider error text ever reaches the browser.

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
