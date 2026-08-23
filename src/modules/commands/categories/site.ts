import { z } from 'zod'

import { register } from '@/modules/commands/registry'

// The lot, and what is already standing on it.
//
// Setbacks were measured against a house at a fixed coordinate and a lot of a
// fixed size, neither of which was in the drawing. The inspector printed a
// distance to a wall nobody could see and the permit sheet printed a dash in
// the box a plan checker reads first.
//
// These commands place the two things those numbers depend on. They are
// ordinary drawing objects — a property line and a structure — so `move.shape`,
// `resize.shape` and `delete.shape` already work on them and undo already
// covers them. Nothing here duplicates those.

const feetLength = z.number().positive().max(2_000)
const feetCoordinate = z.number().min(-100_000).max(100_000)

register({
  id: 'site.property.place',
  runsOn: 'client',
  label: 'Draw the property line',
  description:
    'Draw the lot boundary, or resize the one already drawn. Every number is in FEET. Setbacks are measured from this line, so nothing is measured until it exists.',
  category: 'site',
  inputSchema: z.object({
    widthFt: feetLength.describe('Lot width, left to right, in feet.'),
    depthFt: feetLength.describe('Lot depth, street to rear, in feet.'),
    xFt: feetCoordinate.optional().describe('Left edge, in feet from the drawing origin. Defaults to centring the lot on what is drawn.'),
    yFt: feetCoordinate.optional().describe('Front (street) edge, in feet from the drawing origin.'),
  }),
  outputSchema: z.object({
    shapeId: z.string(),
    widthFt: z.number(),
    depthFt: z.number(),
    created: z.boolean(),
  }),
  voiceExamples: [
    'The lot is eighty by a hundred and ten.',
    'Draw the property line, seventy feet wide and ninety deep.',
    'Make the lot a hundred feet deep.',
  ],
  execute: async input => ({
    ok: true,
    data: { shapeId: 'client-pending', widthFt: input.widthFt, depthFt: input.depthFt, created: false },
  }),
})

register({
  id: 'site.property.remove',
  runsOn: 'client',
  label: 'Remove the property line',
  description: 'Delete the lot boundary. Setbacks go back to reading as not measured, rather than to a default.',
  category: 'site',
  inputSchema: z.object({}),
  outputSchema: z.object({ removed: z.boolean() }),
  voiceExamples: ['Take the property line off.', 'Remove the lot boundary.'],
  execute: async () => ({ ok: true, data: { removed: false } }),
})

register({
  id: 'site.limits.set',
  runsOn: 'client',
  label: 'Set the required setbacks',
  description:
    'Record what the jurisdiction requires on this lot, in FEET, plus any easements. These print on the permit sheet exactly as entered, so leave out anything that has not been looked up.',
  category: 'site',
  inputSchema: z.object({
    frontFt: z.number().min(0).max(500).optional().describe('Required front setback, in feet.'),
    sideFt: z.number().min(0).max(500).optional().describe('Required side setback, in feet.'),
    rearFt: z.number().min(0).max(500).optional().describe('Required rear setback, in feet.'),
    easements: z.string().max(400).optional().describe('Easements of record, in the words that should print.'),
  }),
  outputSchema: z.object({
    frontFt: z.number().nullable(),
    sideFt: z.number().nullable(),
    rearFt: z.number().nullable(),
    easements: z.string().nullable(),
  }),
  voiceExamples: [
    'Side setback is five feet, rear is seven and a half.',
    'The front setback here is twenty five feet.',
    'There is a ten foot drainage easement along the back.',
  ],
  execute: async () => ({
    ok: true,
    data: { frontFt: null, sideFt: null, rearFt: null, easements: null },
  }),
})

register({
  id: 'site.structure.place',
  runsOn: 'client',
  label: 'Place the house',
  description:
    'Put the house — or another structure the pool has to clear — on the drawing. Every number is in FEET. "From house" in the inspector and on the packet measures to this.',
  category: 'site',
  inputSchema: z.object({
    label: z.string().max(60).optional().describe('What this is, e.g. "House" or "Detached garage".'),
    widthFt: feetLength.describe('Length along the x axis, in feet.'),
    depthFt: feetLength.describe('Depth along the y axis, in feet.'),
    xFt: feetCoordinate.describe('Left edge, in feet from the drawing origin.'),
    yFt: feetCoordinate.describe('Top edge, in feet from the drawing origin. The house is normally at negative y.'),
    rotationDeg: z.number().min(-360).max(360).optional(),
  }),
  outputSchema: z.object({ shapeId: z.string(), label: z.string() }),
  voiceExamples: [
    'The house runs forty feet along the back of the patio.',
    'Put the house wall twenty feet north of the pool.',
    'Add the garage on the left.',
  ],
  execute: async input => ({
    ok: true,
    data: { shapeId: 'client-pending', label: input.label ?? 'House' },
  }),
})

register({
  id: 'site.describe',
  runsOn: 'client',
  label: 'Describe the site',
  description:
    'Read back the lot: whether a property line has been drawn, its size, the required setbacks entered for it, what structures are placed, and the measured setback on each side. Read-only. Call this before changing anything.',
  category: 'site',
  inputSchema: z.object({}),
  outputSchema: z.object({
    propertyLine: z
      .object({ shapeId: z.string(), widthFt: z.number(), depthFt: z.number() })
      .nullable(),
    limits: z.object({
      frontFt: z.number().nullable(),
      sideFt: z.number().nullable(),
      rearFt: z.number().nullable(),
      easements: z.string().nullable(),
    }),
    structures: z.array(z.object({ shapeId: z.string(), label: z.string() })),
    setbacks: z
      .array(
        z.object({
          edge: z.string(),
          measuredFt: z.number(),
          requiredFt: z.number().nullable(),
          compliant: z.boolean().nullable(),
        }),
      )
      .nullable(),
  }),
  voiceExamples: [
    'What are the setbacks?',
    'Is there a property line on this drawing?',
    'How far is the pool from the house?',
  ],
  execute: async () => ({
    ok: true,
    data: {
      propertyLine: null,
      limits: { frontFt: null, sideFt: null, rearFt: null, easements: null },
      structures: [],
      setbacks: null,
    },
  }),
})
