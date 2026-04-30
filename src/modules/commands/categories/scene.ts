import { z } from 'zod'
import { register } from '@/modules/commands/registry'

// Scene commands mutate client-only Zustand state (useSunStore). The server
// `execute` validates input and returns a success envelope; the consumer
// (Track F SunDial) registers a client handler via registerClientHandler
// in src/lib/commands/dispatch.ts.

register({
  id: 'sun.set.time',
  label: 'Set sun time',
  description: 'Set the sun-study clock to a given time of day (minutes past midnight).',
  category: 'scene',
  inputSchema: z.object({
    minutesPastMidnight: z.number().min(0).max(24 * 60),
  }),
  outputSchema: z.object({
    minutesPastMidnight: z.number(),
  }),
  voiceExamples: [
    'Set the sun to four PM.',
    'Show afternoon shade.',
  ],
  // CLIENT (Track F SunDial):
  //   useSunStore.getState().setMinutes(input.minutesPastMidnight)
  execute: async (input) => ({
    ok: true,
    data: { minutesPastMidnight: input.minutesPastMidnight },
  }),
})

register({
  id: 'sun.run.study',
  label: 'Run sun study',
  description: 'Animate the sun across the day from sunrise to sunset.',
  category: 'scene',
  inputSchema: z.object({
    durationMs: z.number().positive().optional(),
  }),
  outputSchema: z.object({
    started: z.boolean(),
  }),
  voiceExamples: [
    'Run a sun study.',
    'Show me the day.',
  ],
  // CLIENT (Track F SunDial): start a requestAnimationFrame loop that drives
  //   useSunStore.setMinutes from sunrise → sunset over input.durationMs
  //   (default ~6000ms). Cancel if the dock is closed or another study runs.
  execute: async () => ({ ok: true, data: { started: true } }),
})
