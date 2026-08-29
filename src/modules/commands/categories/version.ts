import { z } from 'zod'

import { register } from '@/modules/commands/registry'

// Many designs for one job.
//
// Server-run, because a version is a row and not a piece of canvas state. The
// editor reloads after activating one, which is what the client-side stores
// need in order to hold a different drawing than the one they were hydrated
// with.

const nameSchema = z.string().trim().min(1).max(80)

register({
  id: 'version.save',
  label: 'Save this design as a version',
  description:
    'Save the drawing as it stands now as a named design, so several can be drawn for one job and compared side by side.',
  category: 'version',
  inputSchema: z.object({
    projectId: z.string().min(1),
    name: nameSchema,
    note: z.string().trim().max(400).optional(),
  }),
  outputSchema: z.object({ versionId: z.string(), name: z.string() }),
  voiceExamples: ['Save this as version two.', 'Save this design as the raised spa option.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const { saveVersion } = await import('@/modules/versions')
    try {
      const args: Parameters<typeof saveVersion>[0] = {
        orgId: ctx.orgId,
        projectId: input.projectId,
        name: input.name,
      }
      if (input.note) args.note = input.note
      if (ctx.userId && ctx.userId !== 'anonymous') args.createdById = ctx.userId
      const version = await saveVersion(args)
      return { ok: true, data: { versionId: version.id, name: version.name } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not save that design.' }
    }
  },
})

register({
  id: 'version.open',
  label: 'Open a design',
  description:
    'Load a saved design into the editor. Work that belongs to no version is kept first, so opening another design never throws away what is on screen.',
  category: 'version',
  inputSchema: z.object({
    projectId: z.string().min(1),
    versionId: z.string().min(1),
  }),
  outputSchema: z.object({ versionId: z.string(), name: z.string() }),
  voiceExamples: ['Open the second design.', 'Show me the version with the raised spa.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const { activateVersion } = await import('@/modules/versions')
    try {
      const version = await activateVersion(ctx.orgId, input.projectId, input.versionId)
      return { ok: true, data: { versionId: version.id, name: version.name } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not open that design.' }
    }
  },
})

register({
  id: 'version.rename',
  label: 'Rename a design',
  description: 'Change what a saved design is called, and the note under it.',
  category: 'version',
  inputSchema: z.object({
    versionId: z.string().min(1),
    name: nameSchema,
    note: z.string().trim().max(400).optional(),
  }),
  outputSchema: z.object({ versionId: z.string() }),
  voiceExamples: ['Call that one the budget option.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const { renameVersion } = await import('@/modules/versions')
    try {
      await renameVersion(ctx.orgId, input.versionId, input.name, input.note)
      return { ok: true, data: { versionId: input.versionId } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not rename that design.' }
    }
  },
})

register({
  id: 'version.delete',
  label: 'Delete a design',
  description:
    'Remove a saved design. The one currently open is refused, so the editor is never left holding a drawing no card describes.',
  category: 'version',
  inputSchema: z.object({ versionId: z.string().min(1) }),
  outputSchema: z.object({ versionId: z.string() }),
  voiceExamples: ['Delete the first design.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const { deleteVersion } = await import('@/modules/versions')
    try {
      await deleteVersion(ctx.orgId, input.versionId)
      return { ok: true, data: { versionId: input.versionId } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not delete that design.' }
    }
  },
})
