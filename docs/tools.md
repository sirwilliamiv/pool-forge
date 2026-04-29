# Editor tools

> **TODO** — this document should be generated from `src/modules/editor/tools/index.ts`. Until a generator script lands, treat this file as a stub.

The editor exposes a typed catalog of tools (selection, drawing, transform, measurement, pricing, export). Each tool has the following 11 fields:

1. Name
2. Icon
3. Tooltip
4. Shortcut
5. Description
6. Inputs
7. Outputs
8. Side effects
9. Error states
10. Undo behavior
11. Voice command examples

The catalog lives at `src/modules/editor/tools/index.ts`. Run `pnpm tsx scripts/gen-tools.ts > docs/tools.md` (script not yet written) to regenerate this document.

For now: open `src/modules/editor/tools/index.ts` directly in source.
