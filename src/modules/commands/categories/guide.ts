import { z } from 'zod'

import { register } from '@/modules/commands/registry'
import { GUIDE_TARGETS } from '@/modules/guide/targets'

// Showing somebody where something is.
//
// The whole category obeys one rule: it changes what is visible and never what
// is stored. Nothing here can move a shape, change a price or write a row. That
// is what makes it safe to let an agent drive: the worst it can do is ring the
// wrong button.
//
// Chrome only. The drawing is WebGL, so a pool is not an element and has no box
// to ring, and the half people get lost in is the panels anyway. Nobody cannot
// find the pool.

const TARGET_IDS = GUIDE_TARGETS.map(target => target.id) as [string, ...string[]]

register({
  id: 'guide.point',
  runsOn: 'client',
  label: 'Point at something',
  description:
    'Ring one or more controls on screen so the user can see where they are, and say what each is for. Pass several when the answer is several: "the drawing tools" is three of them. This only draws attention, it never presses anything.',
  category: 'guide',
  inputSchema: z.object({
    // An enum, not free text. A hallucinated selector would either ring nothing
    // or ring something arbitrary, and both look like the guide is broken.
    targets: z.array(z.enum(TARGET_IDS)).min(1).max(6),
  }),
  outputSchema: z.object({ pointed: z.array(z.string()), missing: z.array(z.string()) }),
  voiceExamples: [
    'Where is the freehand tool?',
    'Show me where the grid size is.',
    'Where are the drawing tools?',
  ],
  execute: async () => ({ ok: true, data: { pointed: [], missing: [] } }),
})

register({
  id: 'guide.clear',
  runsOn: 'client',
  label: 'Stop pointing',
  description: 'Remove every highlight.',
  category: 'guide',
  inputSchema: z.object({}),
  outputSchema: z.object({ cleared: z.boolean() }),
  voiceExamples: ['Thanks, you can stop pointing.'],
  execute: async () => ({ ok: true, data: { cleared: true } }),
})

register({
  id: 'guide.list',
  runsOn: 'client',
  label: 'What can be pointed at here',
  description:
    'List the controls on this screen that can be pointed at, with what each is for. Use this to answer "what can I do here" without guessing.',
  category: 'guide',
  inputSchema: z.object({}),
  outputSchema: z.object({
    targets: z.array(z.object({ id: z.string(), name: z.string(), explain: z.string() })),
  }),
  voiceExamples: ['What can you show me on this page?', 'Explain this page.'],
  execute: async () => ({ ok: true, data: { targets: [] } }),
})
