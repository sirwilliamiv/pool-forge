import { z } from 'zod'

import { register } from '@/modules/commands/registry'
import { GRID_SPACINGS } from '@/lib/geometry/drawing'

// Drawing in plan, and turning what was drawn into something priced.
//
// Every one of these is client-run: the path lives in a Zustand store and the
// canvas is the only thing that can draw it. They go through the registry
// anyway, because that is what makes them reachable from the palette, a hotkey
// and eventually the voice agent without a second implementation.

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

// Bounded deliberately. A freehand drag can emit thousands of samples, and a
// path with ten thousand vertices is a plan nobody can select, a polygon nobody
// can extrude, and a payload that makes every save slow.
const MAX_VERTICES = 2000

register({
  id: 'sketch.create',
  runsOn: 'client',
  label: 'Add a drawn path',
  description:
    'Add a line, curve or freehand outline to the plan from a list of points. Coordinates are in INCHES. A closed path has an area and can become a pool; an open one is a line, like a house wall or a lot line.',
  category: 'sketch',
  inputSchema: z.object({
    points: z.array(pointSchema).min(2).max(MAX_VERTICES),
    closed: z.boolean().default(false),
    /** What it is: "House", "Lot line", "Deck edge". */
    label: z.string().trim().max(60).optional(),
  }),
  outputSchema: z.object({ shapeId: z.string() }),
  voiceExamples: ['Draw the lot line.', 'Start a new outline.'],
  // CLIENT: useShapesStore → addShape(SKETCH_PATH) then updateShape with points
  execute: async () => ({ ok: true, data: { shapeId: 'client-pending' } }),
})

register({
  id: 'sketch.label',
  runsOn: 'client',
  label: 'Label a drawn path',
  description: 'Name a drawn line or outline so the plan says what it is.',
  category: 'sketch',
  inputSchema: z.object({
    id: z.string().min(1),
    label: z.string().trim().max(60),
  }),
  outputSchema: z.object({ id: z.string(), label: z.string() }),
  voiceExamples: ['Call that the property line.', 'Label this the house.'],
  execute: async () => ({ ok: true, data: { id: '', label: '' } }),
})

register({
  id: 'sketch.toPool',
  runsOn: 'client',
  label: 'Convert a drawing to 3D',
  description:
    'Turn a closed drawn outline into a real pool with depth, so the 2D sketch becomes something measured, priced and visible in 3D. Refuses an open path, which has no area.',
  category: 'sketch',
  inputSchema: z.object({
    id: z.string().min(1),
    depthShallow: z.number().min(0.5).max(20).optional(),
    depthDeep: z.number().min(0.5).max(20).optional(),
  }),
  outputSchema: z.object({ shapeId: z.string(), areaSqft: z.number() }),
  voiceExamples: ['Make this a pool.', 'Convert the outline to 3D.'],
  execute: async () => ({ ok: true, data: { shapeId: 'client-pending', areaSqft: 0 } }),
})

register({
  id: 'sketch.toDeck',
  runsOn: 'client',
  label: 'Convert a drawing to decking',
  description: 'Turn a closed drawn outline into a concrete or paver deck.',
  category: 'sketch',
  inputSchema: z.object({
    id: z.string().min(1),
    surface: z.enum(['concrete', 'paver', 'grass']).default('concrete'),
  }),
  outputSchema: z.object({ shapeId: z.string() }),
  voiceExamples: ['Make that concrete deck.', 'Turn this outline into pavers.'],
  execute: async () => ({ ok: true, data: { shapeId: 'client-pending' } }),
})

register({
  id: 'grid.set',
  runsOn: 'client',
  label: 'Set the grid size',
  description: 'Choose how fine the plan grid is, from three inches to five feet.',
  category: 'sketch',
  inputSchema: z.object({
    // An enum rather than a number: a builder works to a tape measure, and a
    // grid of 7.3 inches is a mistake nobody meant to ask for.
    spacing: z.enum(GRID_SPACINGS.map(s => s.id) as [string, ...string[]]),
  }),
  outputSchema: z.object({ spacing: z.string() }),
  voiceExamples: ['Set the grid to six inches.', 'Use a five foot grid.'],
  execute: async () => ({ ok: true, data: { spacing: '' } }),
})

register({
  id: 'grid.snap.toggle',
  runsOn: 'client',
  label: 'Toggle snapping',
  description: 'Turn grid snapping on or off without changing the grid size.',
  category: 'sketch',
  inputSchema: z.object({ on: z.boolean().optional() }),
  outputSchema: z.object({ on: z.boolean() }),
  voiceExamples: ['Turn snapping off.', 'Snap to the grid.'],
  execute: async () => ({ ok: true, data: { on: true } }),
})
