import { z } from 'zod'

import { register } from '@/modules/commands/registry'

// Grading the site.
//
// Two surfaces, always: the ground as it is and the ground as it should be.
// Netting them into one would make the earthwork unrecoverable, and the
// earthwork is the number that goes on the quote.
//
// Every command names which surface it edits rather than relying on a mode, so
// a spoken instruction cannot be ambiguous about whether it is describing what
// is there or what is wanted.

const surface = z
  .enum(['existing', 'finished'])
  .describe('"existing" is the ground as measured; "finished" is where it should end up.')

register({
  id: 'grade.enable',
  runsOn: 'client',
  label: 'Turn site grading on or off',
  description:
    'Switch elevations on for this site. A flat site needs none, so this is off until the first shot is taken.',
  category: 'grade',
  inputSchema: z.object({ enabled: z.boolean() }),
  outputSchema: z.object({ enabled: z.boolean() }),
  voiceExamples: ['Turn on grading.', 'This site is not flat.', 'Switch elevations off.'],
  execute: async input => ({ ok: true, data: { enabled: input.enabled } }),
})

register({
  id: 'grade.point.add',
  runsOn: 'client',
  label: 'Record an elevation',
  description:
    'Record a measured height at a point on the site. Coordinates are in INCHES from the drawing origin, the same as every shape; elevation is in FEET relative to the datum, so a spot three feet below the house pad is -3.',
  category: 'grade',
  inputSchema: z.object({
    surface,
    x: z.number().describe('Distance from the left edge, in inches.'),
    y: z.number().describe('Distance from the top edge, in inches.'),
    elevationFt: z.number().describe('Height in feet. Negative is below the datum.'),
    label: z.string().max(60).optional().describe('What this shot is, e.g. "back fence" or "door sill".'),
    fixed: z
      .boolean()
      .optional()
      .describe('True for a height that cannot move: a door threshold, a neighbour wall, an inlet.'),
  }),
  outputSchema: z.object({ pointId: z.string(), surface: z.string(), count: z.number() }),
  voiceExamples: [
    'The back fence is three feet lower than the house.',
    'Record the ground at the patio door as zero.',
    'Put a spot elevation of minus two at the far corner.',
  ],
  execute: async input => ({ ok: true, data: { pointId: '', surface: input.surface, count: 0 } }),
})

register({
  id: 'grade.point.update',
  runsOn: 'client',
  label: 'Change an elevation',
  description: 'Move a recorded height, or change what it reads.',
  category: 'grade',
  inputSchema: z.object({
    surface,
    pointId: z.string().min(1),
    x: z.number().optional(),
    y: z.number().optional(),
    elevationFt: z.number().optional(),
    label: z.string().max(60).optional(),
  }),
  outputSchema: z.object({ pointId: z.string() }),
  voiceExamples: ['Make that corner four feet down instead.', 'The back fence is lower than I said.'],
  execute: async input => ({ ok: true, data: { pointId: input.pointId } }),
})

register({
  id: 'grade.point.remove',
  runsOn: 'client',
  label: 'Remove an elevation',
  description: 'Delete a recorded height.',
  category: 'grade',
  inputSchema: z.object({ surface, pointId: z.string().min(1) }),
  outputSchema: z.object({ pointId: z.string() }),
  voiceExamples: ['Forget that elevation.', 'Delete the shot at the back fence.'],
  execute: async input => ({ ok: true, data: { pointId: input.pointId } }),
})

register({
  id: 'grade.base.set',
  runsOn: 'client',
  label: 'Set the datum',
  description:
    'Set the height the site sits at everywhere no shot has been taken. Usually zero, meaning the house pad.',
  category: 'grade',
  inputSchema: z.object({ surface, elevationFt: z.number() }),
  outputSchema: z.object({ surface: z.string(), elevationFt: z.number() }),
  voiceExamples: ['Set the datum to zero.', 'Everything starts a foot below the house.'],
  execute: async input => ({ ok: true, data: { surface: input.surface, elevationFt: input.elevationFt } }),
})

register({
  id: 'grade.falloff.set',
  runsOn: 'client',
  label: 'Set how the ground blends',
  description:
    'How sharply each measured height dominates the ground around it. Two reads as a natural fall; higher makes each shot a flat pad with a steeper break between them.',
  category: 'grade',
  inputSchema: z.object({ surface, falloff: z.number().min(1).max(6) }),
  outputSchema: z.object({ surface: z.string(), falloff: z.number() }),
  voiceExamples: ['Make the slope blend more smoothly.', 'I want flatter pads between the shots.'],
  execute: async input => ({ ok: true, data: { surface: input.surface, falloff: input.falloff } }),
})

register({
  id: 'grade.describe',
  runsOn: 'client',
  label: 'Describe the site grading',
  description:
    'Read back the site elevations: every recorded height, the datum, the steepest slope, and the cut and fill between the existing and finished ground. Read-only. Call this before changing anything, since the other commands need point ids.',
  category: 'grade',
  inputSchema: z.object({}),
  outputSchema: z.object({
    enabled: z.boolean(),
    existing: z.object({
      baseElevationFt: z.number(),
      points: z.array(
        z.object({
          id: z.string(),
          x: z.number(),
          y: z.number(),
          elevationFt: z.number(),
          label: z.string().nullable(),
        }),
      ),
    }),
    finished: z.object({
      baseElevationFt: z.number(),
      points: z.array(
        z.object({
          id: z.string(),
          x: z.number(),
          y: z.number(),
          elevationFt: z.number(),
          label: z.string().nullable(),
        }),
      ),
    }),
    /** Cubic yards out, in, and the difference. Never only the difference. */
    cutYards: z.number(),
    fillYards: z.number(),
    netYards: z.number(),
    reliefFt: z.number(),
    maxSlopePct: z.number(),
  }),
  voiceExamples: [
    'How much does this site fall?',
    'What is the cut and fill?',
    'How many yards of dirt are we moving?',
    'Read me the elevations.',
  ],
  execute: async () => ({
    ok: true,
    data: {
      enabled: false,
      existing: { baseElevationFt: 0, points: [] },
      finished: { baseElevationFt: 0, points: [] },
      cutYards: 0,
      fillYards: 0,
      netYards: 0,
      reliefFt: 0,
      maxSlopePct: 0,
    },
  }),
})

register({
  id: 'shape.elevation.set',
  runsOn: 'client',
  label: 'Raise or lower an object',
  description:
    'Set how high an object sits above the ground beneath it, in FEET. Negative sinks it. This is how a raised deck, a sunken patio or a spa above a pool is expressed.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    elevationFt: z.number().describe('Feet above the ground. Negative is below it.'),
  }),
  outputSchema: z.object({ id: z.string(), elevationFt: z.number() }),
  voiceExamples: [
    'Raise the deck eighteen inches.',
    'Drop the patio a foot.',
    'Put the spa eighteen inches above the pool.',
  ],
  execute: async input => ({ ok: true, data: { id: input.id, elevationFt: input.elevationFt } }),
})
