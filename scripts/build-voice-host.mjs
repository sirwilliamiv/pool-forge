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
