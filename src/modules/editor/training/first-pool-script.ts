// The "build your first pool" walkthrough, as data.
//
// A fixed, ordered script — not the model deciding what to do — so the training
// is identical and correct every run. Each step is a line Marco says, the
// controls it highlights, and the command it performs. Every `command` is a
// registered command and every `point` is a real guide target; a unit test
// asserts both, so a step can never silently dispatch nothing.
//
// The runner performs each step in two beats: announce (highlight + say, then
// hold) and act (dispatch, then hold), so a human always sees what and where
// before it happens. Timings live in the runner, not here.

/** Threaded between steps: the ids of things earlier steps created. */
export interface TrainingContext {
  /** The pool created in step 2, so step 3 can set its depths. */
  poolId?: string
}

export interface TrainingStep {
  /** What Marco says while announcing this step. Kept to a sentence or two. */
  say: string
  /** Controls to ring during the announce beat (guide target ids). */
  point?: string[]
  /**
   * The command to perform in the act beat, built from the running context.
   * Return null for a pure-narration step (an intro, the wrap, calling out the
   * price), which announces and holds but changes nothing.
   */
  run?: (ctx: TrainingContext) => { command: string; input: unknown } | null
  /** Store something from the dispatch result into the context for later steps. */
  capture?: (ctx: TrainingContext, data: unknown) => void
  /** Override the default post-action hold (e.g. longer to read the quote). */
  settleMs?: number
}

/** Inches; the drawing origin is top-left, x right, y down. A plausible yard. */
const POOL = { x: 300, y: 340 }

function shapeId(data: unknown): string | undefined {
  return typeof data === 'object' && data !== null
    ? (data as { shapeId?: unknown }).shapeId as string | undefined
    : undefined
}

export const FIRST_POOL_SCRIPT: readonly TrainingStep[] = [
  {
    say: "I'll build one complete pool so you can see how the pieces fit. I'll say each thing before I do it — watch.",
  },
  {
    say: 'First the pool itself. Every shape you place is measured and priced the moment it lands.',
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'pool.rectangle', x: POOL.x, y: POOL.y } }),
    capture: (ctx, data) => {
      const id = shapeId(data)
      if (id) ctx.poolId = id
    },
  },
  {
    say: 'Now the deep end. A pool falls from a shallow end to a deep one — here, three feet down to eight.',
    point: ['panel.layers'],
    run: ctx =>
      ctx.poolId
        ? { command: 'pool.geometry.update', input: { id: ctx.poolId, shallowDepthFt: 3, deepDepthFt: 8 } }
        : null,
  },
  {
    say: 'A raised spa beside it, spilling into the pool.',
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'pool.spa', x: POOL.x + 360, y: POOL.y } }),
  },
  {
    say: 'Steps into the shallow end.',
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'pool.standard-steps', x: POOL.x, y: POOL.y + 150 } }),
  },
  {
    say: 'A main drain on the pool floor.',
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'feature.main-drain', x: POOL.x + 150, y: POOL.y + 60 } }),
  },
  {
    say: 'This is the house the pool sits behind.',
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'site.house-wall', x: POOL.x - 80, y: POOL.y - 260 } }),
  },
  {
    say: 'The lot boundary, so setbacks have something to measure from.',
    point: ['panel.layers'],
    run: () => ({ command: 'site.property.place', input: { widthFt: 70, depthFt: 100 } }),
    settleMs: 1800,
  },
  {
    say: 'And the setbacks the county requires — twenty-five feet at the front, seven and a half at the sides.',
    point: ['panel.layers'],
    run: () => ({ command: 'site.limits.set', input: { frontFt: 25, sideFt: 7.5, rearFt: 15 } }),
  },
  {
    say: 'Pool code needs a barrier — here is the fence.',
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'deck.fence', x: POOL.x - 120, y: POOL.y + 320 } }),
  },
  {
    say: "The ground isn't flat. Turning on grading records how it falls, and the dirt that has to move.",
    point: ['panel.grade'],
    run: () => ({ command: 'grade.enable', input: { enabled: true } }),
  },
  {
    say: 'A couple of measured heights: the far corner sits two feet below the house pad.',
    point: ['panel.grade'],
    run: () => ({ command: 'grade.point.add', input: { surface: 'existing', xFt: 45, yFt: 45, elevationFt: -2, label: 'far corner' } }),
    settleMs: 1800,
  },
  {
    say: 'Notice the price has been climbing the whole time. Every shape you saw added its own line to the quote.',
    point: ['view.fit'],
    run: () => ({ command: 'canvas.fit', input: {} }),
    settleMs: 2500,
  },
  {
    say: "That's a complete job: drawn, measured, priced, ready to send. This was a practice project — discard it, or keep it to build on.",
  },
] as const
