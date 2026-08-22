import { z } from 'zod'

import { register } from '@/modules/commands/registry'

// Opening and closing a voice session.
//
// Registered like everything else so the audit log records who talked to the app
// and for how long, but deliberately without `voiceExamples`: the converter
// refuses any command with none, so these can never be offered to the model as
// tools. An agent that could grant itself session budget is not a budget.

register({
  id: 'voice.session.begin',
  label: 'Begin a voice session',
  description: 'Claim a voice session slot for this organization, or report why one is not available.',
  category: 'settings',
  inputSchema: z.object({}),
  outputSchema: z.object({
    allowed: z.boolean(),
    sessionId: z.string().nullable(),
    /** Written to be read aloud: at the cap the user hears what happened. */
    message: z.string().nullable(),
  }),
  execute: async (_input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const { beginVoiceSession } = await import('@/modules/voice/usage')
    const userId = ctx.userId && ctx.userId !== 'anonymous' ? ctx.userId : null
    const result = await beginVoiceSession(ctx.orgId, userId)

    return result.ok
      ? { ok: true, data: { allowed: true, sessionId: result.sessionId, message: null } }
      : { ok: true, data: { allowed: false, sessionId: null, message: result.message } }
  },
})

register({
  id: 'voice.session.end',
  label: 'End a voice session',
  description: 'Release a voice session slot and record how long it ran.',
  category: 'settings',
  inputSchema: z.object({ sessionId: z.string().min(1) }),
  outputSchema: z.object({ seconds: z.number() }),
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const { endVoiceSession } = await import('@/modules/voice/usage')
    // Scoped to the org as well as the id: a session id would otherwise be a
    // bearer token for closing someone else's session and freeing their slot.
    const { seconds } = await endVoiceSession(input.sessionId, ctx.orgId)
    return { ok: true, data: { seconds } }
  },
})
