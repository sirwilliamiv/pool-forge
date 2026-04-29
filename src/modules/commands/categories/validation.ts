import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'run.validation',
  label: 'Run validation',
  description: 'Run the validation engine against the current project and return any warnings or blocking errors.',
  category: 'validation',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    pass: z.boolean(),
    warnings: z.number(),
    errors: z.number(),
  }),
  voiceExamples: [
    'Run validation.',
    'Check the project for issues.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
