// Compile the voice host and preload for the Electron main process.
//
// The main process runs CommonJS and cannot load TypeScript, but the session
// core, the IPC channel names and the payload types are TypeScript in `src/`.
// Bundling from there keeps one definition of each rather than a hand-written
// CommonJS copy that drifts.

import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const OUT = 'electron/voice'

await mkdir(OUT, { recursive: true })

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
  // The `@/` alias, resolved the same way tsconfig does.
  alias: { '@': './src' },
}

await build({
  ...shared,
  entryPoints: ['src/modules/voice/electron/host.ts'],
  outfile: `${OUT}/host.cjs`,
  // Loaded from the app's own node_modules at runtime: bundling the SDK would
  // pull in its native and dynamic requires for no benefit.
  external: ['@google/genai', 'electron'],
})

await build({
  ...shared,
  entryPoints: ['src/modules/voice/electron/preload.ts'],
  outfile: `${OUT}/preload.cjs`,
  external: ['electron'],
})

// The relay, as its own deployable. Same session core as the desktop host, which
// is the point: a second transport is a socket and a message shape, not a second
// implementation of the agent.
await mkdir('services/voice-relay/dist', { recursive: true })
await build({
  ...shared,
  entryPoints: ['src/modules/voice/relay/main.ts'],
  outfile: 'services/voice-relay/dist/main.cjs',
  external: ['@google/genai', 'ws'],
})
