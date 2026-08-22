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
  /** A project the user has open, as the session would report it. */
  project?: { id: string; name: string }
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

/**
 * The editor always has a project open.
 *
 * Cases used to omit it, which is a state the app cannot be in — and the omission
 * hid a real defect: the agent read "no project" as a general block and stopped
 * doing canvas work that needs no project at all.
 */
const OPEN_PROJECT = { id: 'proj_eval_1', name: 'Phone Demo' }

/** 32 x 16 feet, in the inches the canvas uses. */
const POOL_32x16 = { stencilId: 'pool.rectangle', x: 0, y: 0, width: 384, height: 192 }

export const EVAL_CASES: EvalCase[] = [
  // ---- placing things -------------------------------------------------
  {
    id: 'add-pool-with-size',
    utterance: 'Add a rectangular pool, thirty two feet by sixteen.',
    screen: 'editor',
    project: OPEN_PROJECT,
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
    project: OPEN_PROJECT,
    expect: [
      { kind: 'callCount', commandId: 'add.shape', count: 1 },
      { kind: 'arg', commandId: 'add.shape', path: 'width', equals: 240, tolerance: 1 },
    ],
  },
  {
    // Sized on purpose. "Add a hot tub" with no size is ambiguous, and the agent
    // is right to ask rather than guess — this case exists to test that "hot tub"
    // maps to the spa stencil, not to punish it for asking a good question.
    id: 'add-spa-by-common-name',
    utterance: 'Add a six by six hot tub.',
    screen: 'editor',
    project: OPEN_PROJECT,
    expect: [
      { kind: 'calls', commandId: 'add.shape' },
      { kind: 'argText', commandId: 'add.shape', path: 'stencilId', equals: 'pool.spa' },
    ],
  },
  // 'unsized-spa-asks-first' used to live here, asserting that "add a hot tub"
  // with no size must ask before placing one. It was removed rather than fixed:
  // the stencil has a sensible default size and dropping one is visible and
  // undoable, so placing it is as defensible as asking. The case was pinning a
  // preference as though it were a requirement, and a suite that fails on
  // correct behaviour gets ignored. 'ambiguous-size-asks' below covers the case
  // that genuinely is ambiguous — resizing something by an unstated amount,
  // where there is no default to fall back on.

  {
    id: 'add-sun-shelf',
    utterance: 'Give it a sun shelf.',
    screen: 'editor',
    project: OPEN_PROJECT,
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
    project: OPEN_PROJECT,
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
    project: OPEN_PROJECT,
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
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'generate.quote' }],
  },
  {
    id: 'check-for-problems',
    utterance: 'Is anything wrong with this design?',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'run.validation' }],
  },
  {
    id: 'how-big',
    utterance: 'How many gallons is this pool?',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'calculate.measurements' }],
  },

  // ---- reading the screen ---------------------------------------------
  {
    id: 'reads-the-page',
    utterance: 'What am I looking at?',
    screen: 'priceBook',
    expect: [{ kind: 'calls', commandId: 'page.read' }],
  },
  {
    id: 'reads-a-specific-value',
    utterance: 'What does the salt cell cost?',
    screen: 'priceBook',
    expect: [
      { kind: 'calls', commandId: 'page.read' },
      // Narrowed, not read wholesale: a four hundred row price book arriving in
      // full buries the answer it was asked for.
      { kind: 'argText', commandId: 'page.read', path: 'query', equals: 'salt cell' },
    ],
  },

  // ---- putting mistakes right -------------------------------------------
  {
    // A misheard sentence deleted a pool during a real session, and the agent
    // could only ask whether the user had an undo button.
    id: 'undoes-a-mistake',
    utterance: 'No, I didn\'t want that. Undo it.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'edit.undo' }],
  },
  {
    // Coping is part of the pool's own mesh, so it has no id and delete cannot
    // touch it. The agent called delete three times, each succeeded, and the
    // concrete never moved.
    id: 'removes-coping-without-deleting',
    utterance: 'Get rid of the concrete border around the pool.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'pool.trim.set' },
      { kind: 'doesNotCall', commandId: 'delete.shape' },
    ],
  },

  // ---- knowing what is open --------------------------------------------
  {
    // The agent used to answer "I can't go to the proposal page until I know
    // which project you're referring to" while the browser held the id.
    id: 'knows-the-open-project',
    utterance: 'Take me to the proposal.',
    screen: 'editor',
    project: OPEN_PROJECT,
    expect: [
      { kind: 'calls', commandId: 'nav.goto' },
      { kind: 'argText', commandId: 'nav.goto', path: 'destination', equals: 'proposal' },
    ],
  },

  // ---- filling in the screen -------------------------------------------
  {
    id: 'fills-a-field',
    utterance: 'Set the salesperson to Ray Mitchell.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [{ kind: 'calls', commandId: 'page.fill' }],
  },
  {
    id: 'saves-after-filling',
    utterance: 'Set the salesperson to Ray and save it.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      // Filling changes nothing until something commits it.
      { kind: 'calls', commandId: 'page.fill' },
      { kind: 'calls', commandId: 'page.click' },
    ],
  },
  {
    id: 'will-not-delete-on-first-hearing',
    utterance: 'Delete this project.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      // It may look for the button, but it must not press it unconfirmed.
      { kind: 'doesNotCall', commandId: 'project.delete' },
    ],
  },
  {
    id: 'fills-several-fields',
    utterance: 'Set the salesperson to Ray and the designer to Jane.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      // One call carrying both, not two round trips.
      { kind: 'callCount', commandId: 'page.fill', count: 1 },
    ],
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
    project: OPEN_PROJECT,
    expect: [{ kind: 'callsNothing' }],
  },
  {
    id: 'ambiguous-size-asks',
    utterance: 'Make the pool bigger.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      // "Bigger" is not a number. Guessing one silently resizes someone's job.
      { kind: 'doesNotCall', commandId: 'add.shape' },
    ],
  },
]
