import type { VoiceScreen } from '../scope'

// What the agent is expected to do when someone says something.
//
// Written as assertions about the *tool calls*, not about the words it says.
// Scoring the prose would measure the model's phrasing; scoring the calls
// measures whether the app did the right thing, which is the only question that
// matters here.

export interface ToolCall {
  commandId: string
  args: Record<string, unknown>
}

export interface EvalCase {
  id: string
  /** What a builder actually says. */
  utterance: string
  screen: VoiceScreen
  /** Shapes already on the canvas when the utterance is spoken. */
  scene?: { stencilId: string; x: number; y: number; width?: number; height?: number }[]
  /**
   * Every assertion must hold. Kept coarse on purpose: pinning exact arguments
   * would fail on choices that are equally correct, and an eval that fails on
   * correct behaviour gets ignored within a week.
   */
  expect: Expectation[]
}

export type Expectation =
  /** A command with this id was called. */
  | { kind: 'calls'; commandId: string }
  /** No command with this id was called. */
  | { kind: 'doesNotCall'; commandId: string }
  /** Exactly this many calls to this command. */
  | { kind: 'callCount'; commandId: string; count: number }
  /** A numeric argument within tolerance, on some call to this command. */
  | { kind: 'arg'; commandId: string; path: string; equals: number; tolerance: number }
  /** A string argument exactly equal, on some call to this command. */
  | { kind: 'argText'; commandId: string; path: string; equals: string }
  /** No tool at all was called: the right answer is sometimes a sentence. */
  | { kind: 'callsNothing' }

/** 32 x 16 feet, in the inches the canvas uses. */
const POOL_32x16 = { stencilId: 'pool.rectangle', x: 0, y: 0, width: 384, height: 192 }

export const EVAL_CASES: EvalCase[] = [
  // ---- placing things -------------------------------------------------
  {
    id: 'add-pool-with-size',
    utterance: 'Add a rectangular pool, thirty two feet by sixteen.',
    screen: 'editor',
    expect: [
      { kind: 'calls', commandId: 'add.shape' },
      { kind: 'argText', commandId: 'add.shape', path: 'stencilId', equals: 'pool.rectangle' },
      // The unit trap: feet spoken, inches expected.
      { kind: 'arg', commandId: 'add.shape', path: 'width', equals: 384, tolerance: 1 },
      { kind: 'arg', commandId: 'add.shape', path: 'height', equals: 192, tolerance: 1 },
    ],
  },
  {
    id: 'add-pool-no-duplicate',
    utterance: 'Put in a twenty by ten foot rectangular pool.',
    screen: 'editor',
    expect: [
      { kind: 'callCount', commandId: 'add.shape', count: 1 },
      { kind: 'arg', commandId: 'add.shape', path: 'width', equals: 240, tolerance: 1 },
    ],
  },
  {
    id: 'add-spa-by-common-name',
    utterance: 'Add a hot tub.',
    screen: 'editor',
    expect: [
      { kind: 'calls', commandId: 'add.shape' },
      { kind: 'argText', commandId: 'add.shape', path: 'stencilId', equals: 'pool.spa' },
    ],
  },
  {
    id: 'add-sun-shelf',
    utterance: 'Give it a sun shelf.',
    screen: 'editor',
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'add.shape' },
      { kind: 'argText', commandId: 'add.shape', path: 'stencilId', equals: 'feature.sun-shelf' },
    ],
  },

  // ---- positioning relative to what is there --------------------------
  {
    id: 'deck-around-pool',
    utterance: 'Put a paver deck all the way around the pool with four feet of clearance.',
    screen: 'editor',
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'add.shape' },
      { kind: 'argText', commandId: 'add.shape', path: 'stencilId', equals: 'deck.paver' },
      // Four feet clear on every side: 40 x 24 feet, origin at -4, -4.
      { kind: 'arg', commandId: 'add.shape', path: 'x', equals: -48, tolerance: 6 },
      { kind: 'arg', commandId: 'add.shape', path: 'y', equals: -48, tolerance: 6 },
      { kind: 'arg', commandId: 'add.shape', path: 'width', equals: 480, tolerance: 12 },
      { kind: 'arg', commandId: 'add.shape', path: 'height', equals: 288, tolerance: 12 },
    ],
  },
  {
    id: 'reads-before-answering',
    utterance: 'What is on the canvas right now?',
    screen: 'editor',
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'scene.describe' },
      { kind: 'doesNotCall', commandId: 'add.shape' },
    ],
  },

  // ---- navigation ------------------------------------------------------
  {
    id: 'nav-price-book',
    utterance: 'Take me to the price book.',
    screen: 'dashboard',
    expect: [
      { kind: 'calls', commandId: 'nav.goto' },
      { kind: 'argText', commandId: 'nav.goto', path: 'destination', equals: 'priceBook' },
    ],
  },
  {
    id: 'nav-does-not-invent-a-route',
    utterance: 'Open the billing settings page.',
    screen: 'dashboard',
    expect: [
      // There is no such page. Saying so beats navigating somewhere arbitrary.
      { kind: 'doesNotCall', commandId: 'nav.openProject' },
    ],
  },

  // ---- reads -----------------------------------------------------------
  {
    id: 'price-it-up',
    utterance: 'Price this up for me.',
    screen: 'editor',
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'generate.quote' }],
  },
  {
    id: 'check-for-problems',
    utterance: 'Is anything wrong with this design?',
    screen: 'editor',
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'run.validation' }],
  },
  {
    id: 'how-big',
    utterance: 'How many gallons is this pool?',
    screen: 'editor',
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'calculate.measurements' }],
  },

  // ---- refusing --------------------------------------------------------
  {
    id: 'out-of-scope-is-refused',
    utterance: 'Add a rectangular pool thirty feet long.',
    screen: 'dashboard',
    expect: [
      // The editor is not open. The agent should say so, not fake it.
      { kind: 'doesNotCall', commandId: 'add.shape' },
    ],
  },
  {
    id: 'does-not-guess-a-project',
    utterance: 'Open the Whitfield job.',
    screen: 'dashboard',
    expect: [{ kind: 'calls', commandId: 'nav.openProject' }],
  },
  {
    id: 'chitchat-calls-nothing',
    utterance: 'Morning, how are you?',
    screen: 'editor',
    expect: [{ kind: 'callsNothing' }],
  },
  {
    id: 'ambiguous-size-asks',
    utterance: 'Make the pool bigger.',
    screen: 'editor',
    scene: [POOL_32x16],
    expect: [
      // "Bigger" is not a number. Guessing one silently resizes someone's job.
      { kind: 'doesNotCall', commandId: 'add.shape' },
    ],
  },
]
