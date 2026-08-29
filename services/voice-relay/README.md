# Voice relay

The WebSocket service that lets the **web** build talk to Gemini Live. The
desktop build does not use it: Electron's main process holds the session
directly, which is why that path shipped first and needed no hosting decision.

## Why it exists

The browser cannot talk to Vertex. Ephemeral auth tokens are a Gemini Developer
API feature and Vertex has no equivalent, and Vertex is mandatory here because
these are customer job details and the consumer endpoint permits training on
prompts. Vertex auth is ADC, which must never reach a browser.

So a relay is not a preference between two designs. It is the only shape this can
take, and the decisions worth arguing about are what it carries.

## What it does not do

It has no database, no Prisma client, and no org-scoping logic of its own.

Tool calls are **forwarded to the browser**, which runs them through the same
`dispatch()` every button calls. The obvious alternative — executing commands
here — is wrong twice over: the editor's state lives in a client store, so a
server-side write would leave the screen stale until something refetched, and it
would create a second execution path alongside the existing one, so voice would
quietly miss whatever the client path does.

The conversation itself is `startVoiceSession`, unchanged: the same object the
Electron host runs. A second transport is a socket and a message shape, not a
second implementation of the agent.

## Auth

A cross-origin WebSocket does not reliably carry the next-auth cookie, and
re-implementing session validation here is how two systems drift until one is
wrong. The app mints a short-lived signed ticket instead:

- HMAC-SHA256 over the claims, 60 second TTL, single use
- Carries `userId`, `orgId`, `sessionId`, and the open project
- The org comes from the server session, never from the request body

Replay protection here is per-instance and in memory, which is stated rather than
pretended otherwise: a ticket lives 60 seconds, and the real ceiling is the
database-backed session budget, which is atomic and lives in the app.

## Running it

    pnpm voice:relay          # builds and starts on PORT (default 8080)

Environment:

| Variable | Meaning |
|---|---|
| `VOICE_TICKET_SECRET` | Shared with the app. 32+ chars. Refuses to boot without it. |
| `GCP_PROJECT_ID` | Vertex project |
| `VERTEX_LOCATION` | Defaults to `us-central1` |
| `VERTEX_LIVE_MODEL` | Defaults to the id `pnpm voice:models` verified |
| `VOICE_LIVE` | Must be truthy, same flag as the app |
| `PORT` | Listen port |

## Deploying it

Not deployed yet, and deliberately so — the app's own target is Vercel, which
supports neither custom servers nor long-lived connections, so this has to live
somewhere else. What that costs is known:

- A WebSocket is **one long request**. The service timeout must exceed the
  longest call, and CPU and memory bill for its whole duration.
- `--concurrency` is literally the simultaneous-call ceiling per instance. The
  default of 80 is far too high for sessions holding audio buffers.
- **A reconnect does not return to the same instance.** The resumption handle
  lives in this process, so with more than one instance either session affinity
  is switched on or the handle moves to shared state. Today the handle is
  in-process, which means one instance, which is fine and is a limit worth
  knowing before it is discovered.
- Health checks use `/readyz`. Cloud Run's front end intercepts `/healthz` with
  its own 404 before the request reaches the container.
- `SIGTERM` drains: new sockets are refused and live ones are given fifteen
  seconds, rather than cutting somebody off mid-sentence.

## Content Security Policy

This app currently sets **no CSP**, so there is no `connect-src` to extend. When
one is added it must include `wss://` alongside the API origin: `https://` does
not cover WebSocket connections, and CSP blocks the session silently with no
user-visible error.
