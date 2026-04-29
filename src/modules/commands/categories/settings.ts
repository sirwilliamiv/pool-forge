import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'settings.update',
  label: 'Update setting',
  description: 'Update an organization-scoped application setting by key.',
  category: 'settings',
  inputSchema: z.object({
    key: z.string().min(1),
    value: z.unknown(),
  }),
  outputSchema: z.object({
    key: z.string(),
  }),
  voiceExamples: [
    'Update the default deck material to pavers.',
    'Change my company default coping color.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
