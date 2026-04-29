import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'set.pool.depth',
  label: 'Set pool depth',
  description: 'Set the shallow and/or deep end depths of a pool.',
  category: 'measurement',
  inputSchema: z.object({
    id: z.string(),
    shallow: z.number().positive().optional(),
    deep: z.number().positive().optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    shallow: z.number().nullable(),
    deep: z.number().nullable(),
  }),
  voiceExamples: [
    'Set the shallow end to three feet.',
    'Set the deep end to five and a half feet.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'set.pool.targetArea',
  label: 'Resize pool by target area',
  description: 'Scale a pool proportionally to match a target surface area.',
  category: 'measurement',
  inputSchema: z.object({
    id: z.string(),
    targetArea: z.number().positive(),
  }),
  outputSchema: z.object({
    id: z.string(),
    width: z.number(),
    height: z.number(),
    area: z.number(),
    perimeter: z.number(),
  }),
  voiceExamples: [
    'Resize the selected pool to two hundred thirty eight square feet.',
    'Make the pool three hundred square feet.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'calculate.measurements',
  label: 'Recalculate measurements',
  description: 'Recompute area, perimeter, gallons, deck area, and other measurements for the current drawing.',
  category: 'measurement',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    poolArea: z.number(),
    perimeter: z.number(),
    deckArea: z.number(),
    gallons: z.number(),
  }),
  voiceExamples: [
    'Recalculate measurements.',
    'Update the numbers.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
