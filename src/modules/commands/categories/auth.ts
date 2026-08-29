import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'auth.signOut',
  label: 'Sign out',
  description: 'Sign the current user out of the session.',
  category: 'auth',
  inputSchema: z.object({}),
  outputSchema: z.object({
    signedOut: z.boolean(),
  }),
  voiceExamples: [
    'Sign me out.',
    'Log out.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
