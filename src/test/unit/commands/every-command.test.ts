/** @vitest-environment jsdom */

// Coverage that maintains itself.
//
// Eighty-odd commands are registered, and until now which of them had a test
// was down to whoever wrote the command remembering to write one. That is the
// same failure mode as the commands themselves: everything looks fine, the
// suite is green, and the gap is invisible until a user finds it. `wiring.test`
// proved a handler exists; `handler-behaviour.test` proved the handlers someone
// chose to cover do something. Neither notices a command registered tomorrow
// with no test at all.
//
// So this file is driven by the registry rather than by a hand-written list.
// Every command must appear in the exercise table below, classified, or the
// first test fails and names it. Adding a command without deciding how it is
// covered is no longer possible.
//
// The classification is a claim about the command, and each claim is checked:
//   'mutates' — dispatching it must observably change client state, must leave
//               state alone when aimed at an id that is not there, and must be
//               reversible by edit.undo unless an exception is declared here.
//   'reads'   — must return data and leave every store byte-identical.
//   'server'  — the real work is not reachable from this harness (a database
//               write, a router push, a DOM read). Must say where it happens.
//   'stub'    — must correspond to a command actually flagged `unimplemented`.
//
// The undo pass is the reason this file is worth its length. Undo is the safety
// net under every movement in the app: it is what makes a wrong command a
// mistake rather than a loss, and it is the thing the voice agent reaches for
// when it has done something the user did not ask for. Nothing checked that it
// held across the board. History stores shapes and grade, so any command that
// writes anywhere else is not covered by it, and each of those is written down
// below with the reason rather than quietly skipped.

import { createElement } from 'react'

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCommandPaletteStore } from '@/components/editor/shell/CommandPalette'
import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { dispatch, type DispatchResult } from '@/lib/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import { all } from '@/modules/commands/registry'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useSaveStatusStore } from '@/modules/editor/state/saveStore'
import { useScreenSelectionStore } from '@/modules/editor/state/screenSelectionStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useMaterialsStore } from '@/modules/editor/state/materialsStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { buildFinishCatalog } from '@/modules/materials/catalog'
import { useSunStore } from '@/modules/editor/state/sunStore'
import { useSurveyStore } from '@/modules/editor/state/surveyStore'
import { useViewStore } from '@/modules/editor/state/viewStore'

// The table below is read at module load, so the registry has to be populated
// by then or every command looks unregistered and the whole file passes on an
// empty set.
initCommands()

/** An id nothing on the canvas will ever have. */
const GHOST = 'ghost-not-on-the-canvas'

const POOL = 'pool.rectangle'

type Classification = 'mutates' | 'reads' | 'server' | 'stub'

interface Exercise {
  kind: Classification

  /**
   * Build a valid input, creating whatever it needs to refer to first.
   *
   * A factory rather than a literal because most of these need a shape id or a
   * grade point id that only exists once something has been added.
   */
  input?: () => Promise<unknown>

  /** Where the work actually happens. Required for 'server'. */
  why?: string

  /** Run after dispatch, before the assertions, for anything asynchronous. */
  settle?: () => Promise<void>

  /**
   * Declared exception to the undo pass: this command's effect cannot be taken
   * back. Must say why, so that "undo does not cover this" is a decision on the
   * record rather than an omission nobody notices.
   */
  notUndoable?: string

  /** State paths undo is known not to restore, and why that is acceptable. */
  undoLeaves?: { paths: string[]; why: string }

  /**
   * Declared: this command accepts an id that is not on the canvas.
   *
   * Asserted in both directions. If someone adds the missing check, this
   * declaration fails and has to be deleted, so the list cannot rot into a
   * record of bugs that were fixed years ago.
   */
  ghostSucceeds?: string
}

// Every store a command can reach. Snapshotting all of them rather than the one
// under test is what catches a handler that writes to the right place and also
// stamps on something else on the way past.
const STORES = {
  shapes: useShapesStore,
  selection: useSelectionStore,
  editor: useEditorStore,
  camera: useCameraStore,
  view: useViewStore,
  sun: useSunStore,
  grade: useGradeStore,
  palette: useCommandPaletteStore,
  survey: useSurveyStore,
  screenSelection: useScreenSelectionStore,
  save: useSaveStatusStore,
  comments: useCommentsStore,
}

type Snapshot = Record<string, unknown>

/** Everything a command could have changed, as plain data. Actions drop out. */
function snapshot(): Snapshot {
  const out: Snapshot = {}
  for (const [name, store] of Object.entries(STORES)) {
    out[name] = JSON.parse(JSON.stringify(store.getState())) as unknown
  }
  return out
}

/** Read one `store.field` path out of a snapshot. */
function at(snap: Snapshot, path: string): unknown {
  const [store, field] = path.split('.')
  if (!store || !field) throw new Error(`bad path ${path}`)
  const slice = snap[store] as Record<string, unknown> | undefined
  return slice?.[field]
}

/** Remove one `store.field` path from a snapshot, for a declared exception. */
function without(snap: Snapshot, paths: string[]): Snapshot {
  const copy = JSON.parse(JSON.stringify(snap)) as Snapshot
  for (const path of paths) {
    const [store, field] = path.split('.')
    if (!store || !field) throw new Error(`bad path ${path}`)
    const slice = copy[store] as Record<string, unknown> | undefined
    if (slice) delete slice[field]
  }
  return copy
}

// Frames are driven by hand. `sun.run.study` schedules a requestAnimationFrame
// loop, and a real one would fire in the middle of a later test and move the sun
// under a suite that is asserting nothing moved.
let frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0

/**
 * What the server half of a command hands back.
 *
 * Empty for almost everything: a client command's `execute` validates and
 * echoes, and its handler ignores the response. The comment commands are the
 * exception, because three things about a note are not the browser's to invent
 * — who wrote it, what its id is, and what time it is — so their handlers
 * refuse a response that does not carry them. A stub that answered `{}` would
 * make every comment command fail here for a reason the real server never
 * produces.
 */
let stubbedComments = 0
function serverDataFor(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') return {}
  let parsed: { id?: unknown; input?: unknown }
  try {
    parsed = JSON.parse(body) as { id?: unknown; input?: unknown }
  } catch {
    return {}
  }
  if (typeof parsed.id !== 'string' || !parsed.id.startsWith('comment.')) return {}
  const input = (parsed.input ?? {}) as Record<string, unknown>
  stubbedComments += 1
  const commentId =
    typeof input.commentId === 'string' ? input.commentId : `comment-stub-${stubbedComments}`
  return {
    commentId,
    authorId: 'user-under-test',
    authorName: 'Dana Reyes',
    createdAt: '2026-01-02T03:04:05.000Z',
    actorName: 'Dana Reyes',
    at: '2026-01-02T03:04:05.000Z',
  }
}

function stubGlobals(): void {
  // dispatch() posts to /api/commands and only runs the client half once the
  // server half comes back ok. Without this every handler is skipped and the
  // whole file passes while testing nothing.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: serverDataFor(init?.body) }),
    })),
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    nextFrame += 1
    frames.set(nextFrame, cb)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id)
  })
}

/** Run exactly one frame of whatever is pending. */
async function flushFrame(): Promise<void> {
  const pending = [...frames.entries()]
  frames = new Map()
  for (const [, cb] of pending) cb(performance.now() + 4000)
}

async function run(id: string, input: unknown): Promise<DispatchResult<unknown>> {
  return dispatch<unknown, unknown>(id, input)
}

/** Dispatch and insist it worked, so a broken setup fails where it happened. */
async function must(id: string, input: unknown): Promise<Record<string, unknown>> {
  const result = await run(id, input)
  if (!result.ok) throw new Error(`${id} failed during setup: ${result.error}`)
  return result.data as Record<string, unknown>
}

/** Add a shape the way a user would, and hand back its id. */
async function addShape(stencilId = POOL): Promise<string> {
  const data = await must('add.shape', {
    stencilId,
    x: 0,
    y: 0,
    width: 360,
    height: 168,
  })
  return String(data.shapeId)
}

/**
 * Move every store off its default before a read is exercised.
 *
 * A read tested against a fresh editor proves almost nothing: clearing the
 * selection, resetting the zoom or snapping the camera all look identical to
 * doing nothing when everything is already at its default. Dirtying the state
 * first is what makes "left every store byte-identical" a real claim.
 */
async function dirtyEverything(): Promise<string> {
  const id = await addShape()
  await must('selection.set', { ids: [id] })
  await must('canvas.zoom.in', {})
  await must('canvas.pan', { dx: 12, dy: -8 })
  await must('camera.set.view', { view: 'top' })
  await must('view.set.tab', { tab: 'plan' })
  await must('mode.set.presentation', { mode: 'customer' })
  await must('tool.activate', { tool: 'tool.pan' })
  await must('sun.set.time', { minutesPastMidnight: 16 * 60 })
  await must('nav.focus', { target: 'quote' })
  await must('palette.open', { initialQuery: 'pool' })
  return id
}

/** Leave a note the way a user would, and hand back its id. */
async function addComment(): Promise<string> {
  const data = await must('comment.add', {
    xFt: 6,
    yFt: -3,
    body: 'Check the gas line clearance.',
  })
  return String(data.commentId)
}

/** Record an elevation and hand back its id. */
async function addGradePoint(surface: 'existing' | 'finished'): Promise<string> {
  const data = await must('grade.point.add', {
    surface,
    xFt: 10,
    yFt: 20,
    elevationFt: -2,
  })
  return String(data.pointId)
}

// Reasons shared by several entries, written once so they stay identical.
const VIEWPORT_NOT_DRAWING =
  'The viewport is not drawing data. History holds shapes and grade, and undoing a zoom would ' +
  'consume the undo step the user actually wanted, so moving the camera deliberately does not ' +
  'record one.'
const CHROME_NOT_DRAWING =
  'Panel and mode state is chrome, not content. Undo has to take back the last change to the ' +
  'drawing, and spending it on a tab switch is how undo stops being trustworthy.'
const SELECTION_IS_A_POINTER =
  'Selection points at content rather than being content. Restoring it would make undo after a ' +
  'click take back the click instead of the edit.'
const OPEN_NOTE_IS_A_POINTER =
  'Undo puts the note back but not which pin was open. Which card is showing is a UI cursor, not ' +
  'drawing data, the same way the grade panel\'s editing surface is.'
const EDITING_SURFACE_IS_A_POINTER =
  'Undo restores both ground surfaces but not which one the grade panel is pointed at. The ' +
  'editing surface is a UI cursor, not site data, and every grade command names its own surface.'

/**
 * The whole coverage contract, keyed by command id.
 *
 * Nothing here is optional: a command missing from this table fails the first
 * test by name.
 */
const EXERCISES: Record<string, Exercise> = {
  // ---------- project ----------
  'create.project': {
    kind: 'server',
    why: 'Writes a Project row through Prisma. Covered by create-project.test.ts against the real DB.',
  },
  'open.project': { kind: 'stub' },
  'save.project': { kind: 'stub' },
  'project.proposal.accept': {
    kind: 'server',
    why: 'Advances ProjectStatus and stamps the signature through Prisma, org-scoped. Covered by projects/proposal-acceptance.test.ts against the real DB, including the public share route that dispatches it with no session.',
  },

  // ---------- canvas / camera / view ----------
  'canvas.zoom.in': {
    kind: 'mutates',
    input: async () => ({}),
    notUndoable: VIEWPORT_NOT_DRAWING,
  },
  'canvas.zoom.out': {
    kind: 'mutates',
    input: async () => ({}),
    notUndoable: VIEWPORT_NOT_DRAWING,
  },
  'canvas.fit': {
    kind: 'mutates',
    input: async () => {
      await addShape()
      return {}
    },
    notUndoable: VIEWPORT_NOT_DRAWING,
  },
  'canvas.pan': {
    kind: 'mutates',
    input: async () => ({ dx: 40, dy: -20 }),
    notUndoable: VIEWPORT_NOT_DRAWING,
  },
  'camera.set.view': {
    kind: 'mutates',
    input: async () => ({ view: 'top' }),
    notUndoable: VIEWPORT_NOT_DRAWING,
  },
  'camera.frame.selection': {
    kind: 'mutates',
    input: async () => {
      const id = await addShape()
      await must('selection.set', { ids: [id] })
      return {}
    },
    notUndoable: VIEWPORT_NOT_DRAWING,
  },
  'selection.set': {
    kind: 'mutates',
    input: async () => ({ ids: [await addShape()] }),
    notUndoable: SELECTION_IS_A_POINTER,
  },
  'mode.set.presentation': {
    kind: 'mutates',
    input: async () => ({ mode: 'customer' }),
    notUndoable: CHROME_NOT_DRAWING,
  },
  'tool.activate': {
    kind: 'mutates',
    input: async () => ({ tool: 'tool.pan' }),
    notUndoable: CHROME_NOT_DRAWING,
  },
  'view.set.tab': {
    kind: 'mutates',
    input: async () => ({ tab: 'plan' }),
    notUndoable: CHROME_NOT_DRAWING,
  },
  'scene.describe': {
    kind: 'reads',
    input: async () => {
      await dirtyEverything()
      return {}
    },
  },
  'edit.undo': {
    kind: 'mutates',
    input: async () => {
      await addShape()
      return {}
    },
    notUndoable:
      'Undo is not its own inverse. Dispatching it twice unwinds two edits; the way back from an ' +
      'undo is edit.redo, which is covered by its own entry below.',
  },
  'edit.redo': {
    kind: 'mutates',
    input: async () => {
      await addShape()
      await must('edit.undo', {})
      return {}
    },
  },

  // ---------- shape ----------
  'add.shape': {
    kind: 'mutates',
    input: async () => ({ stencilId: POOL, x: 100, y: 200, width: 360, height: 168 }),
  },
  'select.shape': {
    kind: 'mutates',
    input: async () => ({ ids: [await addShape()] }),
    notUndoable: SELECTION_IS_A_POINTER,
  },
  'move.shape': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), x: 400, y: 250 }),
  },
  'resize.shape': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), width: 480, height: 240 }),
  },
  'rotate.shape': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), degrees: 90 }),
  },
  'delete.shape': {
    kind: 'mutates',
    input: async () => ({ ids: [await addShape()] }),
  },
  'duplicate.shape': {
    kind: 'mutates',
    input: async () => ({ id: await addShape() }),
  },
  'pool.flip': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), axis: 'x' }),
  },
  'pool.shape.set': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), poolShape: 'ellipse' }),
  },
  'pool.lock.ratio': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), locked: true }),
  },
  'shape.rename': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), name: 'Deep end' }),
  },
  'set.shape.material': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), materialId: FINISH_MATERIAL }),
  },
  'pool.geometry.update': {
    kind: 'mutates',
    // Deliberately not the dimensions addShape used. Asking for the size the
    // pool already is would make this pass whether the handler wrote anything
    // or not, which is the exact hole the file is here to close.
    input: async () => ({ id: await addShape(), lengthFt: 25, widthFt: 12 }),
  },
  'pool.material.set': {
    kind: 'mutates',
    // The interior slot, because that is the slot this material belongs to: a
    // slot is a unit, and a material cannot be put in a slot billed in another.
    input: async () => ({ id: await addShape(), slot: 'interior', materialId: FINISH_MATERIAL }),
  },
  'shape.hide': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), hidden: true }),
  },
  'shape.lock': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), locked: true }),
  },
  'pool.depth.set': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), shallowDepth: 4, deepDepth: 8 }),
  },
  'pool.trim.set': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), coping: false }),
  },
  'shape.elevation.set': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), elevationFt: 2.5 }),
  },

  // ---------- measurement ----------
  'set.pool.depth': { kind: 'stub' },
  'set.pool.targetArea': {
    kind: 'mutates',
    input: async () => ({ id: await addShape(), targetAreaSqft: 238 }),
  },
  'calculate.measurements': {
    kind: 'server',
    why: 'Loads the project snapshot from Prisma and derives measurements. Covered by the measurement module tests.',
  },

  // ---------- pricing ----------
  'add.priceBookItem': { kind: 'stub' },
  'select.equipment': { kind: 'stub' },
  'generate.quote': {
    kind: 'server',
    why: 'Prices the project against the org price book in the database. Covered by the pricing module tests.',
  },

  // ---------- validation ----------
  'run.validation': {
    kind: 'server',
    why: 'Runs the rule set over a persisted project. Covered by the validation module tests.',
  },

  // ---------- export ----------
  'export.customerProposal': {
    kind: 'server',
    why: 'Writes an Export row; the client half only opens a tab, and is registered by ExportCommandHandlers, not by the editor. Covered by export.test.ts.',
  },
  'export.constructionPacket': {
    kind: 'server',
    why: 'Writes an Export row; the client half only opens a tab, and is registered by ExportCommandHandlers, not by the editor. Covered by export.test.ts.',
  },
  'export.sitePlan': {
    kind: 'server',
    why: 'Writes an Export row; the client half only opens a tab, and is registered by ExportCommandHandlers, not by the editor. Covered by export.test.ts.',
  },
  'export.screenEnclosureQuote': {
    kind: 'server',
    why: 'Writes an Export row; the client half only opens a tab, and is registered by ExportCommandHandlers, not by the editor. Covered by export.test.ts.',
  },

  // ---------- template ----------
  'apply.shapeTemplate': { kind: 'stub' },
  'save.shapeTemplate': { kind: 'stub' },
  'template.scene.save': {
    kind: 'server',
    why: 'Persists a SceneTemplate row for the org.',
  },
  'template.scene.list': {
    kind: 'server',
    why: 'Reads SceneTemplate rows for the org through Prisma, so it cannot run without a database.',
  },
  'template.scene.apply': {
    kind: 'server',
    why: 'Reads a stored template and returns its shapes; the caller hydrates the canvas from the result.',
  },
  'template.scene.setDefault': {
    kind: 'server',
    why: 'Flips the default flag on a SceneTemplate row.',
  },
  'template.scene.delete': {
    kind: 'server',
    why: 'Removes a SceneTemplate row.',
  },

  // ---------- navigation ----------
  'nav.goto': {
    kind: 'server',
    why: 'Resolves a destination to a path server-side; the client half is a router push registered by VoiceDock, which this harness does not mount.',
  },
  'nav.openProject': {
    kind: 'server',
    why: 'Searches projects in the database by name, then the VoiceDock handler routes. Neither half is reachable from the editor harness.',
  },
  'nav.focus': {
    kind: 'mutates',
    input: async () => ({ target: 'quote' }),
    notUndoable: CHROME_NOT_DRAWING,
  },

  // ---------- comments ----------
  'comment.add': {
    kind: 'mutates',
    input: async () => ({ xFt: 12, yFt: -4, body: 'Check the gas line clearance.' }),
  },
  'comment.edit': {
    kind: 'mutates',
    input: async () => ({
      commentId: await addComment(),
      body: 'Check the gas line clearance at the meter.',
    }),
  },
  'comment.remove': {
    kind: 'mutates',
    input: async () => ({ commentId: await addComment() }),
    undoLeaves: { paths: ['comments.openId'], why: OPEN_NOTE_IS_A_POINTER },
  },
  'comment.resolve': {
    kind: 'mutates',
    input: async () => ({ commentId: await addComment(), resolved: true }),
  },

  // ---------- context ----------
  'page.read': {
    kind: 'server',
    why: 'Reads the rendered DOM, and is registered by VoiceDock rather than the editor. Covered by the page-read module tests against fixture markup.',
  },
  'page.fill': {
    kind: 'server',
    why: 'Drives real form controls in the DOM, registered by VoiceDock. Covered by the page-fill module tests.',
  },
  'page.click': {
    kind: 'server',
    why: 'Presses a real button in the DOM, registered by VoiceDock. Covered by the page-click module tests.',
  },

  // ---------- settings / auth ----------
  'voice.session.begin': {
    kind: 'server',
    why: 'Mints a realtime session against the voice provider and records it.',
  },
  'voice.session.end': {
    kind: 'server',
    why: 'Closes out the recorded voice session.',
  },
  'settings.update': { kind: 'stub' },
  'settings.company.update': {
    kind: 'server',
    why:
      'Writes the Organization row a proposal prints its address, phone, licence number, ' +
      'payment schedule and terms from. Covered by organization/company-settings.test.ts ' +
      'against the real DB. Deliberately carries no voice examples, so the converter refuses ' +
      'it: contract content rewritten from misheard audio is not found until a customer has ' +
      'signed the result.',
  },
  'settings.voice.set': {
    kind: 'server',
    why:
      'Writes the org AppSetting row that decides whether voice must show a confirmation dialog ' +
      'before it removes anything. Deliberately carries no voice examples, so the converter ' +
      'refuses it: a safety gate the assistant can switch off is not a gate.',
  },
  'auth.signOut': { kind: 'stub' },

  // ---------- grade ----------
  'grade.enable': {
    kind: 'mutates',
    input: async () => ({ enabled: true }),
  },
  'grade.point.add': {
    kind: 'mutates',
    input: async () => ({ surface: 'finished', xFt: 10, yFt: 20, elevationFt: -3, label: 'back fence' }),
    undoLeaves: { paths: ['grade.editing'], why: EDITING_SURFACE_IS_A_POINTER },
  },
  'grade.point.update': {
    kind: 'mutates',
    input: async () => ({
      surface: 'existing',
      pointId: await addGradePoint('existing'),
      elevationFt: -4,
    }),
  },
  'grade.point.remove': {
    kind: 'mutates',
    input: async () => ({ surface: 'existing', pointId: await addGradePoint('existing') }),
  },
  'grade.base.set': {
    kind: 'mutates',
    input: async () => ({ surface: 'finished', elevationFt: -1.5 }),
    undoLeaves: { paths: ['grade.editing'], why: EDITING_SURFACE_IS_A_POINTER },
  },
  'grade.falloff.set': {
    kind: 'mutates',
    input: async () => ({ surface: 'finished', falloff: 4 }),
    undoLeaves: { paths: ['grade.editing'], why: EDITING_SURFACE_IS_A_POINTER },
  },
  'grade.describe': {
    kind: 'reads',
    input: async () => {
      await dirtyEverything()
      await addGradePoint('existing')
      return {}
    },
  },

  // ---------- site ----------
  'site.property.place': {
    kind: 'mutates',
    input: async () => ({ widthFt: 80, depthFt: 110, xFt: -40, yFt: -55 }),
  },
  'site.property.remove': {
    kind: 'mutates',
    input: async () => {
      await must('site.property.place', { widthFt: 70, depthFt: 90 })
      return {}
    },
  },
  'site.limits.set': {
    kind: 'mutates',
    input: async () => {
      await must('site.property.place', { widthFt: 70, depthFt: 90 })
      return { frontFt: 25, sideFt: 5, rearFt: 7.5, easements: '10 ft drainage easement, rear' }
    },
  },
  'site.structure.place': {
    kind: 'mutates',
    input: async () => ({ label: 'House', widthFt: 40, depthFt: 24, xFt: -20, yFt: -40 }),
  },
  'site.describe': {
    kind: 'reads',
    input: async () => {
      await dirtyEverything()
      await must('site.property.place', { widthFt: 70, depthFt: 90 })
      return {}
    },
  },

  // ---------- scene ----------
  'sun.set.time': {
    kind: 'mutates',
    input: async () => ({ minutesPastMidnight: 16 * 60 }),
    notUndoable:
      'The sun clock is a viewing condition, like the camera. Nothing about the drawing changes ' +
      'when the shadows move, so there is nothing for undo to put back.',
  },
  'sun.run.study': {
    kind: 'mutates',
    input: async () => ({ durationMs: 8000 }),
    settle: flushFrame,
    notUndoable:
      'Same as sun.set.time, and it is an animation besides: undo would land on whichever frame ' +
      'happened to be current.',
  },

  // ---------- palette ----------
  'palette.open': {
    kind: 'mutates',
    input: async () => ({ initialQuery: 'pool' }),
    notUndoable: CHROME_NOT_DRAWING,
  },
  'palette.run.suggestion': {
    // Was declared 'server', on the grounds that the palette did the
    // delegating. It did not: nothing dispatched the inner command, so every
    // suggestion in the product reported success and changed nothing. The
    // delegation is a client handler now, and this exercises it end to end.
    kind: 'mutates',
    input: async () => ({
      suggestionId: 'validation.depths',
      innerCommandId: 'nav.focus',
      innerInput: { target: 'validation' },
    }),
    notUndoable:
      'It focuses a panel through its inner command. Panel focus is chrome, not part of the drawing, so history does not carry it.',
  },

  // ---------- import ----------
  'import.session.create': {
    kind: 'server',
    why: 'Creates an ImportSession row.',
  },
  'import.image.upload': {
    kind: 'server',
    why: 'Stores the uploaded bytes and writes a SourceImage row.',
  },
  'import.image.analyze': {
    kind: 'server',
    why: 'Sends the image to the model through Vertex and stores the extracted intent.',
  },
  'import.calibrate.set': {
    kind: 'server',
    why: 'Persists the scale calibration on the import session.',
  },
  'import.intent.patch': {
    kind: 'server',
    why: 'Edits the stored intent on the import session.',
  },
  'import.intent.apply': {
    kind: 'server',
    why: 'Turns the stored intent into drawing objects in the database.',
  },
  'import.session.discard': {
    kind: 'server',
    why: 'Deletes the import session and its uploads.',
  },
  'import.intake.link.create': {
    kind: 'server',
    why: 'Issues a customer upload link row.',
  },
  'import.intake.link.update': {
    kind: 'server',
    why: 'Edits an existing customer upload link row.',
  },
  'import.intake.link.list': {
    kind: 'server',
    why: 'Reads the org customer upload links through Prisma.',
  },

  // ---------- site capture ----------
  'capture.heightfield.ingest': {
    kind: 'server',
    why:
      'Decodes a walked heightfield staged by /api/capture/heightfield, writes the existing ' +
      'ground onto the drawing and the coverage mask into a SiteCapture row.',
  },
  'capture.coverage.describe': {
    kind: 'server',
    why: 'Reads the stored coverage mask through Prisma and reports it over a region of the site.',
  },
}

/**
 * Swap every id-shaped field for one that is not on the canvas.
 *
 * Derived from the input rather than declared, so a command that grows an id
 * field is covered by the not-there test without anyone remembering to add one.
 * Returns null when the command takes no id, which is what excuses it.
 */
function ghostVariant(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null) return null
  const copy = { ...(input as Record<string, unknown>) }
  let touched = false
  for (const key of Object.keys(copy)) {
    if (key === 'id' || key === 'pointId' || key === 'commentId') {
      copy[key] = GHOST
      touched = true
    } else if (key === 'ids' && Array.isArray(copy[key])) {
      copy[key] = [GHOST]
      touched = true
    }
  }
  return touched ? copy : null
}

function entriesOf(kind: Classification): [string, Exercise][] {
  return Object.entries(EXERCISES).filter(([, entry]) => entry.kind === kind)
}

/** Every store is a module singleton, so leftovers decide the next test. */
/**
 * A finish catalogue for the two material commands.
 *
 * They validate the material against the organisation's catalogue and refuse
 * anything not in it, which is the whole point of them: they used to accept any
 * string and report success. A harness with no catalogue would be exercising a
 * path the app never takes.
 */
const FINISH_MATERIAL = 'mat-pebbletec-cobalt'

function resetStores(): void {
  useMaterialsStore.getState().hydrate(
    buildFinishCatalog(
      [
        {
          id: FINISH_MATERIAL,
          kind: 'CUSTOM',
          name: 'PebbleTec — Cobalt',
          fillSpec: { type: 'gradient', color: '#1E40AF', slot: 'interior', priceItemId: 'i1' },
        },
      ],
      [],
    ),
  )
  useSelectionStore.getState().clear()
  useEditorStore.setState({
    activeTool: 'tool.select',
    activeMaterialId: null,
    activeStencilId: null,
    mode: 'select',
    zoom: 1,
    panX: 0,
    panY: 0,
    gridVisible: true,
    snapEnabled: true,
    quotePanelOpen: false,
    measureA: null,
    measureB: null,
  })
  useCameraStore.setState({
    targetView: null,
    transitionToken: 0,
    framePose: null,
    frameTarget: null,
  })
  useViewStore.setState({
    viewMode: '3d',
    presentationMode: 'design',
    leftTab: 'layers',
    rightTab: 'design',
    focusedPanel: null,
    focusNonce: 0,
  })
  useSunStore.setState({ minutesPastMidnight: 12 * 60 })
  useCommandPaletteStore.setState({ open: false, initialQuery: '' })
  useSurveyStore.setState({ survey: null, calibrationMode: false })
  useScreenSelectionStore.setState({ x: 0, y: 0, visible: false })
  useSaveStatusStore.setState({ status: 'idle', lastSavedAt: null })
  useGradeStore.getState().hydrate(null)
  useGradeStore.getState().setEditing('existing')
  useCommentsStore.getState().hydrate([])
  // Last, and through hydrate: it clears the undo stack and closes any drag
  // transaction left open, which plain setState leaves dangling and lets
  // history bleed from one test into the next.
  useShapesStore.getState().hydrate([])
  useHistoryStore.getState().reset()
  frames = new Map()
}

beforeEach(() => {
  resetStores()
  stubGlobals()
  // The handlers register in a useEffect, so nothing is dispatchable until the
  // component is actually mounted.
  render(createElement(ClientCommandHandlers))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the exercise table covers the registry', () => {
  it('has an entry for every registered command', () => {
    // The point of the file. A command registered without deciding how it is
    // covered fails here by name, rather than shipping untested and being found
    // by whoever it lies to first.
    const missing = all()
      .map(command => command.id)
      .filter(id => !(id in EXERCISES))

    expect(
      missing,
      `these commands have no entry in every-command.test.ts: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('has no entry for a command that is not registered', () => {
    // The other direction. A renamed or deleted command leaves an entry that
    // tests nothing and reads like coverage.
    const ids = new Set(all().map(command => command.id))
    const orphans = Object.keys(EXERCISES).filter(id => !ids.has(id))

    expect(orphans, `entries for commands that do not exist: ${orphans.join(', ')}`).toEqual([])
  })

  it('finds the registry at all', () => {
    // Guards the guard: with an empty registry both tests above pass vacuously
    // and the file is worthless.
    expect(all().length).toBeGreaterThan(50)
  })

  it('says where the work happens for everything it does not exercise', () => {
    const silent = entriesOf('server')
      .filter(([, entry]) => !entry.why || entry.why.length < 20)
      .map(([id]) => id)

    expect(silent, `'server' entries with no explanation: ${silent.join(', ')}`).toEqual([])
  })

  it('gives every exercised command an input to exercise it with', () => {
    const inputless = [...entriesOf('mutates'), ...entriesOf('reads')]
      .filter(([, entry]) => !entry.input)
      .map(([id]) => id)

    expect(inputless, `no input factory: ${inputless.join(', ')}`).toEqual([])
  })
})

describe('every stub entry is really a stub', () => {
  it('every command flagged unimplemented is classified as a stub', () => {
    // Otherwise a command could be quietly downgraded to a stub and lose its
    // behavioural coverage without anyone noticing.
    const mismatched = all()
      .filter(command => command.unimplemented)
      .map(command => command.id)
      .filter(id => EXERCISES[id]?.kind !== 'stub')

    expect(mismatched, `unimplemented but not listed as a stub: ${mismatched.join(', ')}`).toEqual([])
  })

  it('every stub entry names a command that is still unimplemented', () => {
    // The list cannot rot: the day a stub is built, this fails and forces a real
    // classification, which drags the command into the behavioural tests below.
    const built = entriesOf('stub')
      .map(([id]) => id)
      .filter(id => !all().find(command => command.id === id)?.unimplemented)

    expect(built, `listed as stubs but no longer unimplemented: ${built.join(', ')}`).toEqual([])
  })
})

describe('every mutating command changes something', () => {
  for (const [id, entry] of entriesOf('mutates')) {
    it(`${id} changes client state`, async () => {
      const input = await entry.input!()
      const before = snapshot()

      const result = await run(id, input)
      await entry.settle?.()

      expect(result.ok, `${id} refused valid input: ${result.ok ? '' : result.error}`).toBe(true)
      // Not "a function was called" — the actual state a user would see. This is
      // the defect this codebase produces most reliably: a command that is
      // registered, offered to the voice agent, reports success, and does
      // nothing at all.
      expect(snapshot(), `${id} reported success and changed nothing`).not.toEqual(before)
    })
  }
})

describe('every mutating command refuses an id that is not there', () => {
  for (const [id, entry] of entriesOf('mutates')) {
    it(`${id} leaves state alone when aimed at a missing id`, async () => {
      const valid = await entry.input!()
      const ghost = ghostVariant(valid)
      if (!ghost) {
        // Takes no id, so there is nothing to aim wrongly. Asserted rather than
        // returned silently so the case is visible in the run.
        expect(ghost).toBeNull()
        return
      }

      const before = snapshot()
      const result = await run(id, ghost)
      await entry.settle?.()

      if (entry.ghostSucceeds) {
        // Declared leniency, checked in both directions: when someone adds the
        // missing check this fails and the declaration has to go, so the list
        // records live gaps only.
        expect(
          result.ok,
          `${id} now refuses a missing id — delete its ghostSucceeds note`,
        ).toBe(true)
        return
      }

      expect(result.ok, `${id} accepted an id that is not on the canvas`).toBe(false)
      // Refusing is only half of it. A handler that mutates and then throws
      // leaves the canvas in a state nobody asked for and reports failure, which
      // is worse than either outcome alone.
      expect(snapshot(), `${id} refused but changed state on the way out`).toEqual(before)
    })
  }
})

describe('every reading command reads and nothing else', () => {
  for (const [id, entry] of entriesOf('reads')) {
    it(`${id} returns data and leaves every store untouched`, async () => {
      const input = await entry.input!()
      const before = snapshot()

      const result = await run(id, input)

      expect(result.ok, `${id} failed: ${result.ok ? '' : result.error}`).toBe(true)
      expect(result.ok && result.data, `${id} returned nothing to read`).toBeTruthy()
      // A read with a side effect is the worst kind, because the agent calls it
      // freely: "what is on the canvas" is asked before nearly every edit.
      expect(snapshot(), `${id} changed state while reading`).toEqual(before)
    })
  }
})

describe('undo puts everything back', () => {
  // The reason this file exists. Undo is what makes a wrong command a mistake
  // rather than a loss, and it is the first thing the voice agent reaches for
  // when it has done something the user did not ask for. Every mutating command
  // is dispatched, undone, and compared against a snapshot of the entire editor
  // taken beforehand. Anything undo cannot reach is declared above with a reason
  // rather than skipped, so the holes in the net are written down.
  for (const [id, entry] of entriesOf('mutates')) {
    if (entry.notUndoable) continue

    it(`${id} is fully reversed by edit.undo`, async () => {
      const input = await entry.input!()
      const before = snapshot()
      const pastBefore = useHistoryStore.getState().past.length

      const done = await run(id, input)
      expect(done.ok, `${id} refused valid input`).toBe(true)
      await entry.settle?.()

      const undone = await run('edit.undo', {})
      if (!undone.ok) throw new Error(`edit.undo refused after ${id}: ${undone.error}`)
      // Undo reporting that it had nothing to take back is the quietest way this
      // could pass while being wrong: a command that records no history leaves
      // the state where the command put it, and the comparison below would then
      // be measuring the snapshot against itself.
      expect(
        (undone.data as { undone?: boolean }).undone,
        `${id} recorded no history, so undo had nothing to take back`,
      ).toBe(true)

      const after = snapshot()
      const ignored = entry.undoLeaves?.paths ?? []
      for (const path of ignored) {
        // Anti-rot: a declared exception that no longer describes anything is a
        // comment claiming a gap that has since been closed.
        expect(
          at(after, path),
          `${id} declares undo leaves ${path} behind, but it comes back on its own`,
        ).not.toEqual(at(before, path))
      }

      expect(
        without(after, ignored),
        `${id} is not fully undone. Either fix the handler or declare notUndoable with a reason.`,
      ).toEqual(without(before, ignored))

      // The undo stack itself has to unwind too, or the next undo takes back an
      // edit the user has already seen reversed.
      expect(useHistoryStore.getState().past.length, `${id} left history out of step`).toBe(
        pastBefore,
      )
    })
  }

  it('names every command undo cannot reach, with a reason', () => {
    // A silent skip would let a genuinely undoable command drift out of the pass
    // above and nobody would know until a user lost work.
    const unreasoned = entriesOf('mutates')
      .filter(([, entry]) => entry.notUndoable !== undefined && entry.notUndoable.length < 40)
      .map(([id]) => id)

    expect(unreasoned, `declared not-undoable with no real reason: ${unreasoned.join(', ')}`).toEqual([])
  })

  it('still covers most of what mutates', () => {
    // If the exception list ever grew to swallow the shape commands, the pass
    // above would be green over almost nothing.
    const mutators = entriesOf('mutates')
    const covered = mutators.filter(([, entry]) => !entry.notUndoable)

    expect(covered.length).toBeGreaterThan(mutators.length / 2)
  })
})
