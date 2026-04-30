import { z } from 'zod'
import { register } from '@/modules/commands/registry'

// Palette commands are thin meta-actions. `palette.open` toggles the cmdk
// modal client-side. `palette.run.suggestion` records the suggestion that
// fired and lets the client handler delegate to the inner command id; the
// audit log keeps both the wrapping suggestion and the inner command call.

register({
  id: 'palette.open',
  label: 'Open command palette',
  description: 'Open the ⌘K command palette.',
  category: 'palette',
  inputSchema: z.object({
    initialQuery: z.string().optional(),
  }),
  outputSchema: z.object({
    opened: z.boolean(),
  }),
  voiceExamples: [
    'Open the command palette.',
  ],
  // CLIENT (Track H CommandPalette):
  //   set its open state to true (e.g. usePaletteStore.getState().open(initialQuery))
  execute: async () => ({ ok: true, data: { opened: true } }),
})

register({
  id: 'palette.run.suggestion',
  label: 'Run a palette suggestion',
  description: 'Dispatch a palette suggestion which delegates to an inner command id.',
  category: 'palette',
  inputSchema: z.object({
    suggestionId: z.string(),
    innerCommandId: z.string(),
    innerInput: z.unknown(),
  }),
  outputSchema: z.object({
    ran: z.boolean(),
  }),
  // CLIENT (Track H CommandPalette):
  //   import { dispatch } from '@/lib/commands/dispatch';
  //   await dispatch(input.innerCommandId, input.innerInput);
  //   The wrapping audit row records which suggestion drove the inner call.
  execute: async () => ({ ok: true, data: { ran: true } }),
})
