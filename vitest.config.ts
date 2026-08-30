import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/test/unit/**/*.test.ts',
      'src/test/unit/**/*.test.tsx',
      // Property tests live alongside the example tests and run in the same
      // gate. A property that only runs when someone remembers to run it is a
      // property nobody is checking.
      'src/test/property/**/*.property.test.ts',
      // Integration tests hit the real local Postgres (`pnpm db:up`), same as
      // several tests already living under src/test/unit. New ones go here.
      'src/test/integration/**/*.test.ts',
    ],
    css: false,
  },
})
