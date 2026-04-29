import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'add.shape',
  label: 'Add shape',
  description: 'Drop a stencil onto the canvas at the given coordinates.',
  category: 'shape',
  inputSchema: z.object({
    stencilId: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  }),
  outputSchema: z.object({
    shapeId: z.string(),
  }),
  voiceExamples: [
    'Add a rectangle pool, twenty five feet by ten feet.',
    'Drop a swim out bench on the left side.',
    'Add a sun shelf.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'select.shape',
  label: 'Select shape',
  description: 'Select one or more shapes on the canvas.',
  category: 'shape',
  inputSchema: z.object({
    ids: z.array(z.string()).min(1),
    additive: z.boolean().optional(),
  }),
  outputSchema: z.object({
    selectedIds: z.array(z.string()),
  }),
  voiceExamples: [
    'Select the pool.',
    'Select the deck and the spa.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'move.shape',
  label: 'Move shape',
  description: 'Translate the given shape by an absolute or relative position.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    relative: z.boolean().optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  voiceExamples: [
    'Move the spa over to the right.',
    'Nudge the pool down.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'resize.shape',
  label: 'Resize shape',
  description: 'Resize a shape to explicit width and height.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  outputSchema: z.object({
    id: z.string(),
    width: z.number(),
    height: z.number(),
  }),
  voiceExamples: [
    'Resize the pool to twenty by ten feet.',
    'Make the spa six feet wide.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'rotate.shape',
  label: 'Rotate shape',
  description: 'Rotate a shape by a given angle in degrees.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    degrees: z.number(),
    relative: z.boolean().optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    degrees: z.number(),
  }),
  voiceExamples: [
    'Rotate the pool ninety degrees.',
    'Spin the deck a little to the left.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'delete.shape',
  label: 'Delete shape',
  description: 'Remove one or more shapes from the canvas.',
  category: 'shape',
  inputSchema: z.object({
    ids: z.array(z.string()).min(1),
  }),
  outputSchema: z.object({
    deletedIds: z.array(z.string()),
  }),
  voiceExamples: [
    'Delete the bench.',
    'Remove the selected shapes.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'duplicate.shape',
  label: 'Duplicate shape',
  description: 'Duplicate a shape and place it adjacent to the original.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
  }),
  outputSchema: z.object({
    sourceId: z.string(),
    newId: z.string(),
  }),
  voiceExamples: [
    'Duplicate the pool.',
    'Make a copy of the spa.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'set.shape.material',
  label: 'Set shape material',
  description: 'Apply a material or finish to a shape.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    materialId: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    materialId: z.string(),
  }),
  voiceExamples: [
    'Change the deck to pavers.',
    'Set the pool finish to pebble.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
