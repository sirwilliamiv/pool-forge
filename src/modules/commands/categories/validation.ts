import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'run.validation',
  label: 'Run validation',
  description:
    'Check the current design against the validation rules and report what is wrong. Read-only: it reports, it does not fix anything.',
  category: 'validation',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    errors: z.number(),
    warnings: z.number(),
    passes: z.number(),
    /** Errors first, then warnings: the order someone would want them read out. */
    problems: z.array(z.object({ level: z.string(), message: z.string() })),
  }),
  voiceExamples: [
    'Check this for problems.',
    'Run validation.',
    'Is anything wrong with this design?',
    'What is stopping me sending this?',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const { loadProjectSnapshot } = await import('@/modules/projects/snapshot')
    const snapshot = await loadProjectSnapshot(input.projectId, ctx.orgId)
    if (!snapshot) return { ok: false, error: 'That project is not in this organisation.' }

    const { runValidation } = await import('@/modules/validation/engine')
    const { validationSelectionsFrom } = await import('@/modules/projects/pool-fields')

    const report = runValidation({
      project: snapshot.validationProject,
      measurements: snapshot.measurements,
      selections: validationSelectionsFrom(snapshot.poolFields),
      shapeCount: snapshot.shapes.length,
      hasDeck: snapshot.measurements.hasDeck,
    })

    // Only what is actually wrong, worst first. Reading twenty passes aloud is
    // not an answer to "is anything wrong with this".
    const problems = report.items
      .filter(item => item.level !== 'pass')
      .sort((a, b) => (a.level === 'error' ? -1 : 0) - (b.level === 'error' ? -1 : 0))
      .slice(0, 8)
      .map(item => ({ level: item.level, message: item.message }))

    return {
      ok: true,
      data: {
        errors: report.counts.error,
        warnings: report.counts.warn,
        passes: report.counts.pass,
        problems,
      },
    }
  },
})
