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
    say: "I'll build one complete pool so you can see how it's done. Watch the left panel and the drawing — I'll name each thing before I do it, and you'll do them the same way.",
    settleMs: 2000,
  },
  {
    say: 'Start in the Stencils panel on the left. Search for a shape and click it — whatever you click drops into the middle of the drawing. Here comes the pool.',
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'pool.rectangle', x: POOL.x, y: POOL.y } }),
    capture: (ctx, data) => {
      const id = shapeId(data)
      if (id) ctx.poolId = id
    },
    settleMs: 2000,
  },
  {
    say: 'The pool now shows in the Layers list. With it selected, its depth fields sit in the panel on the right — a pool slopes from a shallow end to a deep one, so I set three feet down to eight.',
    point: ['panel.layers'],
    run: ctx =>
      ctx.poolId
        ? { command: 'pool.geometry.update', input: { id: ctx.poolId, shallowDepthFt: 3, deepDepthFt: 8 } }
        : null,
    settleMs: 2000,
  },
  {
    say: "Back to Stencils. Search 'spa' and click it — a raised spa lands beside the pool, ready to spill into it.",
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'pool.spa', x: POOL.x + 360, y: POOL.y } }),
    settleMs: 2000,
  },
  {
    say: "Same panel, search 'steps'. Click, and steps drop into the shallow end.",
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'pool.standard-steps', x: POOL.x, y: POOL.y + 150 } }),
    settleMs: 2000,
  },
  {
    say: "Search 'main drain' and click to set one on the pool floor. Every piece you add gets measured and priced the moment it lands.",
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'feature.main-drain', x: POOL.x + 150, y: POOL.y + 60 } }),
    settleMs: 2000,
  },
  {
    say: "Now the surroundings. Search 'house wall' and click — this is the house the pool sits behind.",
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'site.house-wall', x: POOL.x - 80, y: POOL.y - 260 } }),
    settleMs: 2000,
  },
  {
    say: 'Next the lot. Open the Layers panel and drop the property boundary — seventy by a hundred feet — so setbacks have an edge to measure from.',
    point: ['panel.layers'],
    run: () => ({ command: 'site.property.place', input: { widthFt: 70, depthFt: 100 } }),
    settleMs: 2200,
  },
  {
    say: 'From the same panel, set the setbacks your county requires — twenty-five feet at the front, seven and a half at the sides. Anything too close will now flag itself.',
    point: ['panel.layers'],
    run: () => ({ command: 'site.limits.set', input: { frontFt: 25, sideFt: 7.5, rearFt: 15 } }),
    settleMs: 2200,
  },
  {
    say: "Pool code needs a barrier. Back in Stencils, search 'fence' and click to run one around the yard.",
    point: ['panel.stencils'],
    run: () => ({ command: 'add.shape', input: { stencilId: 'deck.fence', x: POOL.x - 120, y: POOL.y + 320 } }),
    settleMs: 2000,
  },
  {
    say: "The ground is never flat. Open the Grade tab and turn grading on — now the app tracks how the yard falls and the dirt that has to move.",
    point: ['panel.grade'],
    run: () => ({ command: 'grade.enable', input: { enabled: true } }),
    settleMs: 2000,
  },
  {
    say: 'In the Grade tab you drop measured heights. I mark the far corner two feet below the house pad, and the cut-and-fill updates from it.',
    point: ['panel.grade'],
    run: () => ({ command: 'grade.point.add', input: { surface: 'existing', xFt: 45, yFt: 45, elevationFt: -2, label: 'far corner' } }),
    settleMs: 2200,
  },
  {
    say: "That's the whole job on screen. The Fit button frames everything — and look at the Live Quote up top: it's been adding a line for every piece the whole time.",
    point: ['view.fit'],
    run: () => ({ command: 'canvas.fit', input: {} }),
    settleMs: 2800,
  },
  {
    say: "A complete job: drawn, measured, priced, ready to send. That's the whole loop, and you do each step exactly the way you just watched. This was a practice project — discard it, or keep it to build on.",
  },
] as const
