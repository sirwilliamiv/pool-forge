import { z } from 'zod'
import { register } from '@/modules/commands/registry'
import { dismissFirstRun } from '@/modules/onboarding/first-run'

// Closing the setup checklist is a user action, so it dispatches like every
// other user action and leaves an audit row. It would have been one line of
// Prisma in an onClick, which is exactly the bypass `CLAUDE.md` forbids.
//
// Deliberately no `voiceExamples`. The converter refuses a command with none,
// so the agent is never offered it: there is nothing to gain from dismissing a
// checklist by voice, and plenty to lose if it mishears something else as it.
register({
  id: 'settings.firstRun.dismiss',
  label: 'Dismiss the setup checklist',
  description:
    'Hide the first-run setup checklist for this organization. The steps it names are not ' +
    'changed; the card simply stops being shown.',
  category: 'settings',
  inputSchema: z.object({}),
  outputSchema: z.object({ dismissed: z.literal(true) }),
  execute: async (_input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    await dismissFirstRun(ctx.orgId)
    return { ok: true, data: { dismissed: true } }
  },
})
