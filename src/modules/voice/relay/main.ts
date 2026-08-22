import { startRelay } from './server'

// Entry point for the relay as a deployable.
//
// Deliberately tiny: everything it does is in `server.ts`, which is imported by
// tests directly. A main that held logic would be logic nothing tested.

const port = Number(process.env['PORT'] ?? 8080)

try {
  startRelay({ port })
  console.log(`[relay] listening on ${port}`)
} catch (error) {
  // Almost always a missing VOICE_TICKET_SECRET. Failing at boot is right: a
  // relay that started without one would accept forged tickets and look healthy.
  console.error(`[relay] failed to start: ${String(error)}`)
  process.exit(1)
}

// A WebSocket is one long request. On a platform that sends SIGTERM before
// replacing an instance, draining means refusing new sockets and letting live
// ones finish rather than cutting somebody off mid-sentence.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[relay] ${signal}: draining`)
    setTimeout(() => process.exit(0), 15_000).unref()
  })
}
