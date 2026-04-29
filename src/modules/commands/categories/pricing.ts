import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'add.priceBookItem',
  label: 'Add price book item',
  description: 'Add a new line item to the active price book.',
  category: 'pricing',
  inputSchema: z.object({
    priceBookId: z.string(),
    category: z.string(),
    name: z.string().min(1),
    unitType: z.string().min(1),
    unitCost: z.number().nonnegative().optional(),
    retailPrice: z.number().nonnegative().optional(),
    customerVisible: z.boolean().optional(),
    required: z.boolean().optional(),
  }),
  outputSchema: z.object({
    itemId: z.string(),
  }),
  voiceExamples: [
    'Add a new price book item for salt cell maintenance.',
    'Add an upgrade for LED lighting.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'select.equipment',
  label: 'Select equipment',
  description: 'Choose equipment options (heater, pump, sanitation, lighting, etc.) for the project.',
  category: 'pricing',
  inputSchema: z.object({
    projectId: z.string(),
    selections: z.record(z.string(), z.string()),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    selections: z.record(z.string(), z.string()),
  }),
  voiceExamples: [
    'Add a Pentair salt system.',
    'Use the heat pump heater.',
    'Pick the premium light package.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'generate.quote',
  label: 'Generate quote',
  description: 'Build a quote from the current drawing measurements, selections, and price book.',
  category: 'pricing',
  inputSchema: z.object({
    projectId: z.string(),
    priceBookId: z.string().optional(),
  }),
  outputSchema: z.object({
    quoteId: z.string(),
    subtotal: z.number(),
    total: z.number(),
  }),
  voiceExamples: [
    'Show me the quote.',
    'Generate the quote.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
