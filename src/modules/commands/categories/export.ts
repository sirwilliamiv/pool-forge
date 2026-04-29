import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'export.customerProposal',
  label: 'Export customer proposal',
  description: 'Render the customer-facing proposal PDF for the project.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    exportId: z.string(),
    url: z.string(),
  }),
  voiceExamples: [
    'Export the customer proposal.',
    'Generate the proposal PDF.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'export.constructionPacket',
  label: 'Export construction packet',
  description: 'Render the construction-facing packet PDF with detailed measurements and specs.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    exportId: z.string(),
    url: z.string(),
  }),
  voiceExamples: [
    'Export the construction packet.',
    'Generate the construction PDF.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
