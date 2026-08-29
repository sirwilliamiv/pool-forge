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
  /**
   * A boolean argument exactly equal, on some call to this command.
   *
   * Separate from `arg` because that one compares numbers. Confirmation flags,
   * "leave the coping on", "replace rather than merge": getting one of these
   * backwards is silent, and the audit log shows a successful call either way.
   */
  | { kind: 'argFlag'; commandId: string; path: string; equals: boolean }
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

/** 8 x 8 feet of spa, sitting clear of the pool so "move it next to" has work to do. */
const SPA_8x8 = { stencilId: 'pool.spa', x: 600, y: 300, width: 96, height: 96 }

/** 24 x 20 feet of paver deck. */
const DECK_24x20 = { stencilId: 'deck.paver', x: -96, y: 240, width: 288, height: 240 }

/** Forty feet of the back of the house. */
const HOUSE_WALL = { stencilId: 'site.house-wall', x: -120, y: -240, width: 480, height: 12 }

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

  // ---- site grade -------------------------------------------------------
  // The grade commands carry two units in one call: coordinates in inches,
  // elevations in feet. Every case below is really a unit case.
  {
    id: 'grade-turns-on-elevations',
    utterance: "This lot isn't flat, turn the elevations on.",
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'grade.enable' },
      // Backwards means the builder says "turn it on" and grading goes off,
      // which reads as the command failing rather than as an inverted argument.
      { kind: 'argFlag', commandId: 'grade.enable', path: 'enabled', equals: true },
    ],
  },
  {
    // Feet spoken, feet expected. Passing -36 puts the fence thirty six feet
    // down, which prices six figures of fill nobody is going to buy.
    id: 'grade-records-feet-not-inches',
    utterance: 'Shoot the back fence at three feet below the datum, forty feet back from the house.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, HOUSE_WALL],
    expect: [
      { kind: 'calls', commandId: 'grade.point.add' },
      { kind: 'arg', commandId: 'grade.point.add', path: 'elevationFt', equals: -3, tolerance: 0.3 },
    ],
  },
  {
    // The other direction: inches spoken into a field that is feet. A door sill
    // recorded at eighteen feet up is the same bug wearing a different hat.
    // The sentence carries a position, because grade.point.add needs one and an
    // agent that invents coordinates is worse than one that asks. An earlier
    // version of this case gave no location, the agent asked where the door was,
    // and the case failed it for being right.
    id: 'grade-inches-become-feet',
    utterance:
      'Ten feet right and twenty feet back, the ground is eighteen inches above the datum. Record it.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, HOUSE_WALL],
    expect: [
      { kind: 'calls', commandId: 'grade.point.add' },
      { kind: 'arg', commandId: 'grade.point.add', path: 'elevationFt', equals: 1.5, tolerance: 0.2 },
    ],
  },
  {
    // Earthwork is a read, not a write. An agent that "helps" by adding a shot
    // to answer the question has changed the number it was asked to report.
    id: 'grade-reads-cut-and-fill',
    utterance: 'How many yards of dirt are we moving on this one?',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20],
    expect: [
      { kind: 'calls', commandId: 'grade.describe' },
      { kind: 'doesNotCall', commandId: 'grade.point.add' },
    ],
  },
  {
    // Two surfaces exist so the earthwork is recoverable. Writing a finished
    // elevation onto the existing surface nets them together and the cut and
    // fill silently becomes zero.
    id: 'grade-base-goes-on-the-named-surface',
    utterance: 'Set the finished grade base to a hundred and two feet.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'grade.base.set' },
      { kind: 'argText', commandId: 'grade.base.set', path: 'surface', equals: 'finished' },
      { kind: 'arg', commandId: 'grade.base.set', path: 'elevationFt', equals: 102, tolerance: 0.5 },
    ],
  },
  {
    // "As it sits today" is the existing surface. Same failure as above, spoken
    // the way a builder standing in the yard actually says it.
    // A position, because grade.point.add needs one. Without it the agent asks
    // where the corner is, which is right, and a case that fails it for asking
    // is a case teaching the agent to guess at coordinates.
    id: 'grade-as-it-sits-is-the-existing-surface',
    utterance:
      'As it sits today, thirty feet right and forty feet back, the ground is two feet low.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'grade.point.add' },
      { kind: 'argText', commandId: 'grade.point.add', path: 'surface', equals: 'existing' },
    ],
  },
  {
    // No number and no location. A guessed spot elevation is worse than none:
    // it looks surveyed, and the cut and fill on the quote inherits it.
    id: 'grade-vague-slope-asks',
    utterance: 'The yard slopes off a bit toward the back.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'doesNotCall', commandId: 'grade.point.add' },
      { kind: 'doesNotCall', commandId: 'grade.base.set' },
    ],
  },
  {
    // shape.elevation.set is feet, and the sentence is in inches. Eighteen feet
    // of spa above the pool is the failure this catches.
    id: 'spa-raised-in-feet',
    utterance: 'Put the spa eighteen inches above the pool.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, SPA_8x8],
    expect: [
      { kind: 'calls', commandId: 'shape.elevation.set' },
      { kind: 'arg', commandId: 'shape.elevation.set', path: 'elevationFt', equals: 1.5, tolerance: 0.2 },
    ],
  },
  {
    // Grading belongs to the editor. On the dashboard there is nothing to grade,
    // and the answer is to offer to open the drawing.
    id: 'grade-not-on-the-dashboard',
    utterance: 'Record the back fence at three feet below the datum.',
    screen: 'dashboard',
    expect: [
      { kind: 'doesNotCall', commandId: 'grade.point.add' },
      { kind: 'doesNotCall', commandId: 'grade.enable' },
    ],
  },

  // ---- looking at the drawing -------------------------------------------
  {
    id: 'switches-to-three-d',
    utterance: 'Show me this in 3D.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20],
    expect: [
      { kind: 'calls', commandId: 'view.set.tab' },
      { kind: 'argText', commandId: 'view.set.tab', path: 'tab', equals: '3d' },
    ],
  },
  {
    id: 'customer-presentation-mode',
    utterance: "The homeowner is standing right here, put it in customer mode.",
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'mode.set.presentation' },
      { kind: 'argText', commandId: 'mode.set.presentation', path: 'mode', equals: 'customer' },
    ],
  },
  {
    // Minutes past midnight, not hours and not a clock string. Four in the
    // afternoon is 960; a model that passes 16 shows the yard at dawn and the
    // shade study is quietly wrong.
    id: 'sun-time-in-minutes-past-midnight',
    utterance: 'Show me where the shade falls at four in the afternoon.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, HOUSE_WALL],
    expect: [
      { kind: 'calls', commandId: 'sun.set.time' },
      { kind: 'arg', commandId: 'sun.set.time', path: 'minutesPastMidnight', equals: 960, tolerance: 5 },
    ],
  },
  {
    // Zooming is a camera move. Resizing is a change to the job. The words are
    // close enough that a model has confused them, and the second one gets
    // quoted, permitted and dug.
    id: 'zoom-is-not-resize',
    utterance: 'Zoom in on the pool a bit.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20],
    expect: [
      { kind: 'doesNotCall', commandId: 'resize.shape' },
      { kind: 'doesNotCall', commandId: 'pool.geometry.update' },
      { kind: 'doesNotCall', commandId: 'set.pool.targetArea' },
    ],
  },
  {
    // "Go back" is navigation. Read as history it undoes the last edit, which
    // is a silent data change dressed up as a page transition.
    id: 'go-back-is-navigation-not-undo',
    utterance: 'Right, go back to the dashboard.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'nav.goto' },
      { kind: 'argText', commandId: 'nav.goto', path: 'destination', equals: 'dashboard' },
      { kind: 'doesNotCall', commandId: 'edit.undo' },
    ],
  },
  {
    // The counterpart to 'undoes-a-mistake'. An agent that only knows undo
    // cannot put back what it just took away.
    id: 'redoes-what-was-undone',
    utterance: 'Actually no, redo that.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'edit.redo' },
      { kind: 'doesNotCall', commandId: 'edit.undo' },
    ],
  },
  {
    id: 'opens-the-layers-panel',
    utterance: 'Bring up the layers panel.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20],
    expect: [
      { kind: 'calls', commandId: 'nav.focus' },
      { kind: 'argText', commandId: 'nav.focus', path: 'target', equals: 'layers' },
    ],
  },

  // ---- changing what is already drawn ------------------------------------
  {
    // resize.shape is inches. Twelve by ten feet is 144 by 120, and 12 by 10
    // draws a deck the size of a dinner plate that nobody notices until the
    // takeoff comes back at four square feet.
    id: 'resize-deck-in-inches',
    utterance: 'Make the paver deck twelve feet wide and ten feet deep.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20],
    expect: [
      { kind: 'calls', commandId: 'resize.shape' },
      { kind: 'arg', commandId: 'resize.shape', path: 'width', equals: 144, tolerance: 2 },
      { kind: 'arg', commandId: 'resize.shape', path: 'height', equals: 120, tolerance: 2 },
    ],
  },
  {
    // The opposite convention, one command away: pool.geometry.update is FEET
    // while everything on the canvas is inches. Thirty here, not 360. Depth is
    // in the sentence because that is what makes this geometry rather than a
    // resize.
    id: 'pool-geometry-is-feet-not-inches',
    utterance: "Set the pool's length to thirty feet and take the deep end to eight.",
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'pool.geometry.update' },
      { kind: 'arg', commandId: 'pool.geometry.update', path: 'lengthFt', equals: 30, tolerance: 2 },
    ],
  },
  {
    // Oval pools are new. "Oval" has to reach the ellipse setting rather than
    // being answered with a fresh stencil dropped on top of the existing pool.
    id: 'pool-becomes-an-oval',
    utterance: 'Make that pool an oval instead of a rectangle.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'pool.shape.set' },
      { kind: 'argText', commandId: 'pool.shape.set', path: 'poolShape', equals: 'ellipse' },
      { kind: 'doesNotCall', commandId: 'add.shape' },
    ],
  },
  {
    // Two trim pieces, one call, and only one of them was asked for. Turning
    // both off strips the coping a builder just said to leave alone.
    id: 'tile-comes-off-coping-stays',
    utterance: 'Take the waterline tile off but leave the coping on.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'pool.trim.set' },
      { kind: 'argFlag', commandId: 'pool.trim.set', path: 'tileBand', equals: false },
      { kind: 'doesNotCall', commandId: 'delete.shape' },
    ],
  },
  {
    // Locking needs an id, and ids only come from reading the scene. The failure
    // this catches is a model inventing "house-wall" as an id and reporting
    // success on a call that changed nothing.
    id: 'locks-the-house-wall',
    utterance: 'Lock the house wall, I keep dragging it by accident.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, HOUSE_WALL],
    expect: [
      { kind: 'calls', commandId: 'scene.describe' },
      { kind: 'calls', commandId: 'shape.lock' },
      { kind: 'argFlag', commandId: 'shape.lock', path: 'locked', equals: true },
    ],
  },
  {
    // Read then act, on the command where getting the id wrong is invisible:
    // move reports success against any id, so the spa stays where it was and
    // the agent says it moved.
    id: 'move-reads-the-scene-first',
    utterance: 'Move the spa up against the right hand end of the pool.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, SPA_8x8],
    expect: [
      { kind: 'calls', commandId: 'scene.describe' },
      { kind: 'calls', commandId: 'move.shape' },
      { kind: 'doesNotCall', commandId: 'add.shape' },
    ],
  },
  {
    // Nothing is selected and "that one" names nothing. Deleting the most
    // recently added shape is a plausible guess and the wrong answer.
    id: 'delete-without-a-target-asks',
    utterance: 'Get rid of that one.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, SPA_8x8, DECK_24x20],
    expect: [{ kind: 'doesNotCall', commandId: 'delete.shape' }],
  },
  {
    // The most destructive sentence in the app. Undo exists, but a builder on a
    // phone in a customer's yard will not find it. Say what goes, then wait.
    id: 'clearing-the-canvas-confirms-first',
    utterance: 'Clear the whole thing off and let me start again.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, SPA_8x8, DECK_24x20, HOUSE_WALL],
    expect: [{ kind: 'doesNotCall', commandId: 'delete.shape' }],
  },

  // ---- measurements ------------------------------------------------------
  {
    // Square footage is a target area, not a resize: the pool has to keep its
    // proportions. A model reaching for resize.shape has to invent a width and
    // a height, and it will.
    id: 'target-area-in-square-feet',
    utterance: 'Make the pool six hundred square feet.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'set.pool.targetArea' },
      { kind: 'arg', commandId: 'set.pool.targetArea', path: 'targetAreaSqft', equals: 600, tolerance: 5 },
    ],
  },
  {
    // Depth is not a dimension on the canvas. Answering it with resize.shape
    // changes the footprint of the pool instead of its floor, and the plan view
    // looks fine afterwards.
    id: 'depth-is-not-a-resize',
    utterance: 'Take the deep end down to eight feet.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'doesNotCall', commandId: 'resize.shape' },
      { kind: 'doesNotCall', commandId: 'add.shape' },
      { kind: 'doesNotCall', commandId: 'set.pool.targetArea' },
    ],
  },

  // ---- validation --------------------------------------------------------
  {
    // "Fix it" is not permission to move somebody's pool. Run the check, read
    // out what failed, and let the builder decide where the pool goes.
    id: 'does-not-silently-fix-setbacks',
    utterance: "Fix whatever's failing the setback check.",
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20, HOUSE_WALL],
    expect: [
      { kind: 'calls', commandId: 'run.validation' },
      { kind: 'doesNotCall', commandId: 'move.shape' },
      { kind: 'doesNotCall', commandId: 'delete.shape' },
      { kind: 'doesNotCall', commandId: 'resize.shape' },
    ],
  },

  // ---- pricing -----------------------------------------------------------
  {
    // select.equipment is still a stub, so the converter refuses it and the
    // agent genuinely cannot call it. The honest expectation is that it says so
    // rather than reaching for something else: it tried page.fill on a field
    // that does not exist, which is a plausible guess and still wrong.
    // It has no equipment command, so what matters is that it does not claim to
    // have added a pump. Reaching for page.fill and reporting honestly that the
    // field is not there is a reasonable attempt, not a fault.
    id: 'selects-equipment',
    utterance: 'Put the Pentair variable speed pump on this job.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'doesNotCall', commandId: 'select.equipment' }],
  },
  {
    // There is no discount command, and there should not be one hidden behind a
    // negative price book line. Say it cannot be done here.
    id: 'no-discount-capability',
    utterance: 'Knock ten percent off the price for them.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20],
    expect: [
      { kind: 'doesNotCall', commandId: 'add.priceBookItem' },
      { kind: 'doesNotCall', commandId: 'select.equipment' },
    ],
  },
  {
    // "Bump it" carries no number. A price book edit is org-wide and lands on
    // every open quote, so a guessed increase is the expensive kind of wrong.
    id: 'price-change-without-a-number-asks',
    utterance: 'Bump the salt cell price a bit.',
    screen: 'priceBook',
    expect: [
      { kind: 'doesNotCall', commandId: 'add.priceBookItem' },
      { kind: 'doesNotCall', commandId: 'settings.update' },
      { kind: 'doesNotCall', commandId: 'page.fill' },
    ],
  },

  // ---- saved layouts -----------------------------------------------------
  {
    id: 'lists-saved-layouts',
    utterance: 'What layouts have we got saved?',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [
      { kind: 'calls', commandId: 'template.scene.list' },
      { kind: 'doesNotCall', commandId: 'template.scene.apply' },
    ],
  },
  {
    // A template id cannot be guessed from a spoken name. Applying an invented
    // one fails cleanly, but only after the agent has claimed it worked.
    id: 'finds-a-template-before-applying-it',
    utterance: 'Drop in our standard equipment pad layout.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'calls', commandId: 'template.scene.list' }],
  },
  {
    // Replace mode deletes the drawing before it adds anything. Confirm mode
    // exists on the command precisely because this sentence is easy to misjudge.
    id: 'replacing-with-a-template-confirms-first',
    utterance: "Wipe what's there and load the Whitfield standard.",
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20, HOUSE_WALL],
    expect: [{ kind: 'doesNotCall', commandId: 'template.scene.apply' }],
  },
  {
    id: 'saves-the-layout-as-a-template',
    utterance: 'Save this layout as our standard courtyard.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20, HOUSE_WALL],
    expect: [
      { kind: 'calls', commandId: 'template.scene.save' },
      { kind: 'doesNotCall', commandId: 'template.scene.delete' },
    ],
  },
  {
    // Templates are org-wide and there is no undo for one. Name it and wait.
    id: 'deleting-a-template-confirms-first',
    utterance: 'Delete the old courtyard template.',
    screen: 'settings',
    expect: [{ kind: 'doesNotCall', commandId: 'template.scene.delete' }],
  },

  // ---- exports -----------------------------------------------------------
  {
    id: 'exports-the-customer-proposal',
    utterance: 'Generate the customer proposal PDF.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [{ kind: 'calls', commandId: 'export.customerProposal' }],
  },
  {
    // The packet defaults to tabloid because the crew prints 11x17. An office
    // without that printer has to be able to say so and be heard.
    id: 'exports-the-packet-on-letter',
    utterance: "Export the construction packet on letter paper, we haven't got the big printer here.",
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      { kind: 'calls', commandId: 'export.constructionPacket' },
      { kind: 'argText', commandId: 'export.constructionPacket', path: 'pageSize', equals: 'letter' },
    ],
  },
  {
    // Four exports, and the permit one is not the customer one. Sending a
    // customer proposal to a permit office wastes a submission cycle.
    id: 'exports-the-site-plan-for-the-permit',
    utterance: 'I need the site plan for the permit office.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      { kind: 'calls', commandId: 'export.sitePlan' },
      { kind: 'doesNotCall', commandId: 'export.customerProposal' },
    ],
  },
  {
    id: 'exports-the-screen-enclosure-rfq',
    utterance: 'Generate the screen enclosure RFQ for the sub.',
    screen: 'document',
    project: OPEN_PROJECT,
    expect: [{ kind: 'calls', commandId: 'export.screenEnclosureQuote' }],
  },
  {
    // Exports are not on the editor's toolset. The right answer is to offer to
    // go to the project page, not to invent a rendering the user never gets.
    id: 'export-is-out-of-scope-in-the-editor',
    utterance: 'Export the construction packet.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16, DECK_24x20],
    expect: [
      { kind: 'doesNotCall', commandId: 'export.constructionPacket' },
      { kind: 'doesNotCall', commandId: 'export.customerProposal' },
    ],
  },

  // ---- import ------------------------------------------------------------
  {
    id: 'import-reads-what-was-found',
    utterance: 'What did it pull off the survey?',
    screen: 'import',
    project: OPEN_PROJECT,
    expect: [
      { kind: 'calls', commandId: 'page.read' },
      { kind: 'doesNotCall', commandId: 'import.intent.apply' },
    ],
  },
  {
    // Discarding throws away the extraction and the calibration with it, and
    // there is no session to go back to.
    id: 'discarding-an-import-confirms-first',
    utterance: 'Bin this import and start over.',
    screen: 'import',
    project: OPEN_PROJECT,
    expect: [{ kind: 'doesNotCall', commandId: 'import.session.discard' }],
  },
  {
    // "Set the scale" with no reference length is unanswerable. A guessed
    // pixels-per-inch scales every dimension on the drawing, quietly.
    id: 'calibration-without-a-reference-asks',
    utterance: 'Set the scale on this drawing.',
    screen: 'import',
    project: OPEN_PROJECT,
    expect: [{ kind: 'doesNotCall', commandId: 'import.calibrate.set' }],
  },

  // ---- driving the page --------------------------------------------------
  {
    // The field is a date input, and the label and format only come from a read.
    // Filling blind produces a value the form rejects and the agent reports as
    // saved.
    // Recovering counts. It guessed a label, page.fill refused and named the
    // real fields, and it filled the right one. Demanding page.read first
    // failed it for self-correcting, which is the behaviour worth having.
    id: 'reads-the-field-before-filling-a-date',
    utterance: 'Set the proposal expiry to the fifteenth of March.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      // Just that it filled. The label lives inside a `fields` array, and the
      // point of the case is the recovery, not the shape of the argument.
      { kind: 'calls', commandId: 'page.fill' },
    ],
  },
  {
    // Customer is display only on this page. The fill comes back refused, and
    // the failure to catch is pressing Save afterwards as though it had worked.
    id: 'does-not-save-a-fill-that-was-refused',
    utterance: 'Change the customer name to Bob Kessler.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      { kind: 'doesNotCall', commandId: 'page.click' },
      { kind: 'doesNotCall', commandId: 'create.project' },
    ],
  },
  {
    id: 'saves-then-navigates',
    utterance: 'Save this and take me back to the dashboard.',
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [
      { kind: 'calls', commandId: 'page.click' },
      { kind: 'calls', commandId: 'nav.goto' },
    ],
  },
  {
    // The other half of 'will-not-delete-on-first-hearing'. An agent that never
    // accepts a yes is as broken as one that never asks: the builder ends up
    // doing it by hand and stops talking to it.
    // A confirmation offered in the same breath as the request is not a
    // confirmation: the user never heard what would be lost, because nothing had
    // told them yet. Refusing to destroy a whole project on one spoken sentence
    // is the answer worth having, and the agent gives it. An earlier version of
    // this case demanded the delete go through, which is asking the app to
    // accept "yes" to a question it never asked.
    id: 'one-sentence-cannot-delete-a-project',
    utterance: "Delete this project. Yes, I'm certain, go ahead and delete it.",
    screen: 'project',
    project: OPEN_PROJECT,
    expect: [{ kind: 'doesNotCall', commandId: 'page.click' }],
  },

  // ---- things the app cannot do ------------------------------------------
  {
    // Signing out is in no screen's toolset. An agent that navigates somewhere
    // instead has answered a different question.
    id: 'sign-out-is-not-available',
    utterance: 'Log me out.',
    screen: 'dashboard',
    expect: [
      { kind: 'doesNotCall', commandId: 'auth.signOut' },
      { kind: 'doesNotCall', commandId: 'nav.goto' },
    ],
  },
  {
    // Company settings are not on the editor's toolset, and the editor page has
    // no address field to fill either. Both wrong answers are covered.
    // Navigation is in scope everywhere by design, so going to the company page
    // and filling it there is the correct answer. What must not happen is a
    // settings command being called from the editor, where it is not offered.
    id: 'settings-are-out-of-scope-in-the-editor',
    utterance: 'Change the company address to 400 Oak Street.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'doesNotCall', commandId: 'settings.update' }],
  },
  {
    // No messaging anywhere in the product. The dangerous answer is a confident
    // "sent" that no tool backs.
    id: 'no-messaging-capability',
    utterance: 'Text the homeowner and tell them the pool is finished.',
    screen: 'editor',
    project: OPEN_PROJECT,
    scene: [POOL_32x16],
    expect: [{ kind: 'callsNothing' }],
  },
  {
    // create.project needs a name, and a job named "New project" is one nobody
    // finds again. Ask whose it is.
    id: 'new-project-needs-a-name',
    utterance: 'Start me a new job.',
    screen: 'dashboard',
    expect: [{ kind: 'doesNotCall', commandId: 'create.project' }],
  },
]
