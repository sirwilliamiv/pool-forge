# `modules/voice`

Everything the voice agent needs, in one place. Nothing outside this directory
knows the agent exists, and this directory owns no domain logic of its own.

```
voice/
  config.ts     model + endpoint settings, read from env, validated once
  tools.ts      command registry  ->  Gemini function declarations
  scope.ts      which commands are offered on which screen
  session.ts    transport-agnostic session: audio in, tool calls out
  README.md     this file
```

## The one rule

**The voice layer executes nothing.** It decides *which* command to call and with
what arguments, then hands that to the same `dispatch()` every button already
uses. Validation, org scoping, the audit row and undo all come from there.

If you find yourself adding a Prisma import to this directory, something has gone
wrong: it means voice has grown a second execution path, and the two will drift.

## Why the declarations are generated

`CLAUDE.md` says the command registry exists so the app is voice-ready without a
rewrite. Every registered command already carries a description, a Zod input
schema and `voiceExamples`, so `tools.ts` derives the tool surface from the
registry rather than restating it. A command added tomorrow is speakable
tomorrow; a renamed one cannot drift out of sync with a hand-maintained list.

A schema that Gemini's subset cannot express is **refused with a stated reason**,
never published in a mangled form. Its JSON-Schema subset drops recursive and
polymorphic shapes silently, so a mangled declaration would let the model call a
command with a missing argument and nothing anywhere would report it.

## Why scope is enforced twice

`scope.ts` decides what the model is offered on a given screen, and the session
re-checks every tool call against that same scope before forwarding it. The
second check is not redundant: a model can hallucinate a name, or reach for a
tool from a screen the user has since left. Never trust the caller to stay inside
the surface it was handed.

## Where it runs

The session is deliberately transport-agnostic, because it has two homes:

1. **Electron first.** The desktop build already runs a Node main process with
   ADC available and no browser CSP in the way, so the whole loop can be proven
   with no server infrastructure and no hosting decision at all.
2. **A small ws service later**, for the web app. Vertex has no ephemeral tokens
   (they are Gemini Developer API only), so a browser can never hold the
   credential and a relay is the only available shape.

`session.ts` knows about neither. It is handed a way to send audio and a way to
ask the client to run a tool, and it owns the conversation in between.
