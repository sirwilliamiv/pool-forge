import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'canvas.zoom.in',
  label: 'Zoom in',
  description: 'Increase the canvas zoom level.',
  category: 'canvas',
  inputSchema: z.object({
    step: z.number().positive().optional(),
  }),
  outputSchema: z.object({
    zoom: z.number(),
  }),
  voiceExamples: [
    'Zoom in.',
    'Zoom in a little more.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'canvas.zoom.out',
  label: 'Zoom out',
  description: 'Decrease the canvas zoom level.',
  category: 'canvas',
  inputSchema: z.object({
    step: z.number().positive().optional(),
  }),
  outputSchema: z.object({
    zoom: z.number(),
  }),
  voiceExamples: [
    'Zoom out.',
    'Zoom out a bit.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'canvas.fit',
  label: 'Fit to page',
  description: 'Fit all drawing content to the visible canvas.',
  category: 'canvas',
  inputSchema: z.object({}),
  outputSchema: z.object({
    zoom: z.number(),
  }),
  voiceExamples: [
    'Fit to page.',
    'Show everything.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'canvas.pan',
  label: 'Pan canvas',
  description: 'Pan the canvas viewport by a relative offset.',
  category: 'canvas',
  inputSchema: z.object({
    dx: z.number(),
    dy: z.number(),
  }),
  outputSchema: z.object({
    x: z.number(),
    y: z.number(),
  }),
  voiceExamples: [
    'Pan to the right.',
    'Move the view down.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
