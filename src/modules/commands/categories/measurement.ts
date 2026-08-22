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
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'set.pool.targetArea',
  label: 'Resize pool by target area',
  description: 'Scale a pool proportionally to match a target surface area.',
  category: 'measurement',
  runsOn: 'client',
  inputSchema: z.object({
    id: z.string(),
    targetAreaSqft: z.number().positive().describe('Target surface area in square feet.'),
  }),
  outputSchema: z.object({
    id: z.string(),
    widthFt: z.number(),
    lengthFt: z.number(),
    areaSqft: z.number(),
  }),
  voiceExamples: [
    'Resize the selected pool to two hundred thirty eight square feet.',
    'Make the pool three hundred square feet.',
  ],
  // CLIENT: scale both sides by sqrt(target / current), which is the only
  // resize that hits an area without changing the pool's proportions.
  execute: async input => ({
    ok: true,
    data: { id: input.id, widthFt: 0, lengthFt: 0, areaSqft: input.targetAreaSqft },
  }),
})

register({
  id: 'calculate.measurements',
  label: 'Calculate measurements',
  description:
    'Report the measured figures for the current design: pool size, surface area, perimeter, gallons, deck area, coping. Read-only.',
  category: 'measurement',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    hasPool: z.boolean(),
    poolLengthFt: z.number(),
    poolWidthFt: z.number(),
    poolSurfaceArea: z.number(),
    poolPerimeter: z.number(),
    poolGallons: z.number(),
    poolAvgDepth: z.number(),
    deckArea: z.number(),
    copingLinearFeet: z.number(),
  }),
  voiceExamples: [
    'How big is this pool?',
    'What is the surface area?',
    'How many gallons is it?',
    'How much decking is there?',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const { loadProjectSnapshot } = await import('@/modules/projects/snapshot')
    const snapshot = await loadProjectSnapshot(input.projectId, ctx.orgId)
    if (!snapshot) return { ok: false, error: 'That project is not in this organisation.' }

    const m = snapshot.measurements
    return {
      ok: true,
      data: {
        hasPool: m.hasPool,
        poolLengthFt: m.poolLengthFt,
        poolWidthFt: m.poolWidthFt,
        poolSurfaceArea: m.poolSurfaceArea,
        poolPerimeter: m.poolPerimeter,
        poolGallons: m.poolGallons,
        poolAvgDepth: m.poolAvgDepth,
        deckArea: m.deckArea,
        copingLinearFeet: m.copingLinearFeet,
      },
    }
  },
})
