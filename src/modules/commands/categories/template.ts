import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'apply.shapeTemplate',
  label: 'Apply shape template',
  description: 'Insert a saved shape template onto the canvas.',
  category: 'template',
  inputSchema: z.object({
    templateId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  outputSchema: z.object({
    shapeId: z.string(),
  }),
  voiceExamples: [
    'Apply the standard rectangle pool template.',
    'Drop in the kidney pool template.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'save.shapeTemplate',
  label: 'Save shape template',
  description: 'Save the current selection as a reusable shape template.',
  category: 'template',
  inputSchema: z.object({
    name: z.string().min(1),
    shapeId: z.string(),
    category: z.string().min(1),
  }),
  outputSchema: z.object({
    templateId: z.string(),
  }),
  voiceExamples: [
    'Save this as a template called Standard Backyard.',
    'Save shape as a template.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
