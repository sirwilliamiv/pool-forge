import { z } from 'zod'
import { register } from '@/modules/commands/registry'
import { STENCILS } from '@/modules/editor/stencils'

// Server `execute` for shape commands records intent and echoes input so the
// CommandAuditLog row is meaningful. The actual `useShapesStore` mutation is
// applied client-side via a handler registered through
// `registerClientHandler` in src/lib/commands/dispatch.ts. The consumer track
// (E for inspector, D for selection, H for palette) registers the handler.

/**
 * Every stencil the catalogue actually has.
 *
 * Derived, not written out: a hand-kept list would drift the first time a
 * stencil was added, and a stencil missing from here is one voice cannot place.
 */
const STENCIL_IDS = STENCILS.map(stencil => stencil.id) as [string, ...string[]]

/** Ids paired with their names, so the model can match what a person said. */
function stencilIdHelp(): string {
  const named = STENCILS.map(stencil => `${stencil.id} (${stencil.name})`).join(', ')
  return `Which stencil to place. One of: ${named}`
}

register({
  id: 'add.shape',
  runsOn: 'client',
  label: 'Add shape',
  description:
    'Drop a stencil onto the canvas at the given coordinates. Coordinates and sizes are in INCHES: multiply feet by 12.',
  category: 'shape',
  inputSchema: z.object({
    // An enum, not a string. An unknown id does not fail: `addShape` falls back
    // to a generic STENCIL kind, so a hallucinated id silently drops a blank
    // rectangle on the canvas that looks like the app is broken. Offering the
    // real ids means a wrong guess cannot be expressed.
    stencilId: z.enum(STENCIL_IDS).describe(stencilIdHelp()),
    x: z.number().describe('Distance from the left edge, in inches.'),
    y: z.number().describe('Distance from the top edge, in inches.'),
    width: z.number().positive().optional().describe('Width in inches. 32 feet is 384.'),
    height: z.number().positive().optional().describe('Height in inches. 16 feet is 192.'),
    displayHint: z.record(z.unknown()).optional(),
  }),
  outputSchema: z.object({
    shapeId: z.string(),
  }),
  voiceExamples: [
    'Add a rectangle pool, twenty five feet by ten feet.',
    'Drop a swim out bench on the left side.',
    'Add a sun shelf.',
  ],
  // CLIENT: useShapesStore.getState().addStencil(input.stencilId, input.x, input.y)
  //         (or addShape(kind, x, y, opts) for non-stencil kinds)
  execute: async () => ({ ok: true, data: { shapeId: 'client-pending' } }),
})

register({
  id: 'select.shape',
  runsOn: 'client',
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
  // CLIENT: useSelectionStore.getState().selectMany(input.ids)
  //   (with additive=true, merge with existing selectedIds)
  execute: async (input) => ({ ok: true, data: { selectedIds: input.ids } }),
})

register({
  id: 'move.shape',
  runsOn: 'client',
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
  // CLIENT: const s = useShapesStore.getState();
  //         const cur = s.shapes.find(x => x.id === input.id);
  //         const x = input.relative ? (cur?.x ?? 0) + input.x : input.x;
  //         const y = input.relative ? (cur?.y ?? 0) + input.y : input.y;
  //         s.updateShape(input.id, { x, y });
  execute: async (input) => ({
    ok: true,
    data: { id: input.id, x: input.x, y: input.y },
  }),
})

register({
  id: 'resize.shape',
  runsOn: 'client',
  label: 'Resize shape',
  description: 'Resize a shape to explicit width and height, in INCHES: multiply feet by 12.',
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
  // CLIENT: useShapesStore.getState().updateShape(input.id, { width: input.width, height: input.height })
  execute: async (input) => ({
    ok: true,
    data: { id: input.id, width: input.width, height: input.height },
  }),
})

register({
  id: 'rotate.shape',
  runsOn: 'client',
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
  // CLIENT: const s = useShapesStore.getState();
  //         const cur = s.shapes.find(x => x.id === input.id);
  //         const rotation = input.relative ? (cur?.rotation ?? 0) + input.degrees : input.degrees;
  //         s.updateShape(input.id, { rotation });
  execute: async (input) => ({
    ok: true,
    data: { id: input.id, degrees: input.degrees },
  }),
})

register({
  id: 'delete.shape',
  runsOn: 'client',
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
  // CLIENT: useShapesStore.getState().removeShapes(input.ids);
  //         useSelectionStore.getState().clear();
  execute: async (input) => ({ ok: true, data: { deletedIds: input.ids } }),
})

register({
  id: 'duplicate.shape',
  runsOn: 'client',
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
  // CLIENT: const newId = useShapesStore.getState().duplicate(input.id);
  //         return { sourceId: input.id, newId };
  execute: async (input) => ({
    ok: true,
    data: { sourceId: input.id, newId: 'client-pending' },
  }),
})

register({
  id: 'pool.flip',
  runsOn: 'client',
  label: 'Flip shape',
  description: 'Mirror a shape across its X or Y axis.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    axis: z.enum(['x', 'y']),
  }),
  outputSchema: z.object({
    id: z.string(),
    axis: z.enum(['x', 'y']),
  }),
  // CLIENT: reflect shape geometry locally — for X axis flip, negate width-side
  //   asymmetric features (e.g., shallow vs deep ends, sun shelf side); for Y
  //   axis, mirror along width. Track A wires the actual geometry mutation.
  execute: async (input) => ({ ok: true, data: { id: input.id, axis: input.axis } }),
})

register({
  id: 'pool.shape.set',
  runsOn: 'client',
  label: 'Set pool footprint',
  description: 'Switch a pool between a rectangular and an elliptical footprint.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    poolShape: z.enum(['rectangle', 'ellipse']),
  }),
  outputSchema: z.object({
    id: z.string(),
    poolShape: z.enum(['rectangle', 'ellipse']),
  }),
  // It had none, so the converter refused it and the agent could not reach a
  // capability that was already built and working.
  voiceExamples: [
    'Make that pool an oval.',
    'Turn it into a rectangle instead.',
    'Round the pool off.',
  ],
  execute: async (input) => ({ ok: true, data: { id: input.id, poolShape: input.poolShape } }),
})

register({
  id: 'pool.lock.ratio',
  runsOn: 'client',
  label: 'Lock aspect ratio',
  description: 'Constrain L/W proportion when resizing.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    locked: z.boolean(),
  }),
  outputSchema: z.object({
    id: z.string(),
    locked: z.boolean(),
  }),
  // CLIENT: useEditorStore.getState().setRatioLock(input.id, input.locked)
  //   — purely UI state; resize commands consult this when both L and W change
  //   in the same commit. Track A adds the editorStore field + consumer.
  execute: async (input) => ({ ok: true, data: { id: input.id, locked: input.locked } }),
})

register({
  id: 'shape.rename',
  runsOn: 'client',
  label: 'Rename shape',
  description: 'Rename a shape in-canvas (e.g., from the inspector selection card).',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    name: z.string().max(120),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
  voiceExamples: ['Rename the pool to Backyard Lap Pool.'],
  // CLIENT: useShapesStore.getState().renameShape(input.id, input.name)
  //   (Shape.name is optional; persistence round-trips it via the JSON column.)
  execute: async (input) => ({ ok: true, data: { id: input.id, name: input.name } }),
})

register({
  id: 'set.shape.material',
  runsOn: 'client',
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
  // CLIENT: useShapesStore.getState().updateShape(input.id, { materialId: input.materialId })
  //         (Note: Shape type doesn't have materialId yet — Track E adds it via
  //         displayHint or extends the Shape interface.)
  execute: async (input) => ({
    ok: true,
    data: { id: input.id, materialId: input.materialId },
  }),
})

register({
  id: 'pool.geometry.update',
  runsOn: 'client',
  label: 'Update pool geometry',
  // Unlike add.shape and resize.shape, this one is in FEET: the client half
  // multiplies by twelve. Sibling commands disagreeing about units is exactly
  // what a model reading these schemas cold gets wrong, so every field says so.
  description:
    'Update the selected pool: length, width, average depth, shallow and deep depth, or floor slope. Every field is named with its unit and every one is in FEET.',
  category: 'shape',
  // The unit lives in the field name, not only in the description. Told that
  // these are feet while add.shape next door says to multiply feet by twelve,
  // a model sent 360 for "thirty feet" and reported back "the pool is now 30
  // feet long". A field called lengthFt cannot be misread that way.
  inputSchema: z.object({
    id: z.string(),
    lengthFt: z.number().positive().optional().describe('Length in feet, not inches.'),
    widthFt: z.number().positive().optional().describe('Width in feet, not inches.'),
    avgDepthFt: z.number().positive().optional().describe('Average depth in feet.'),
    shallowDepthFt: z.number().positive().optional().describe('Shallow end depth in feet.'),
    deepDepthFt: z.number().positive().optional().describe('Deep end depth in feet.'),
    slope: z.number().optional().describe('Floor slope, rise over run.'),
  }),
  outputSchema: z.object({
    id: z.string(),
  }),
  voiceExamples: [
    'Make the pool deeper at the deep end.',
    'Lengthen the pool to thirty feet.',
  ],
  // CLIENT (Track E PositionSection / GeometrySection):
  //   const patch: Partial<Shape> = {};
  //   if (input.length != null) patch.width = input.length * 12;   // feet → inches
  //   if (input.width  != null) patch.height = input.width  * 12;
  //   if (input.shallowDepth != null) patch.depthShallow = input.shallowDepth;
  //   if (input.deepDepth    != null) patch.depthDeep   = input.deepDepth;
  //   useShapesStore.getState().updateShape(input.id, patch);
  execute: async (input) => ({ ok: true, data: { id: input.id } }),
})

register({
  id: 'pool.material.set',
  runsOn: 'client',
  label: 'Set pool material slot',
  description: 'Apply a material to a specific surface slot of the selected pool (interior, coping, or tile band).',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    slot: z.enum(['interior', 'coping', 'tileBand']),
    materialId: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    slot: z.enum(['interior', 'coping', 'tileBand']),
    materialId: z.string(),
  }),
  voiceExamples: [
    'Change the interior to PebbleTec Cobalt.',
    'Set the coping to travertine.',
  ],
  // CLIENT (Track E MaterialSection):
  //   Persist via DrawingObject.displayHint until the Shape type carries
  //   per-slot material ids natively. The patch shape is:
  //     { displayHint: { ...prev.displayHint, [slotKey]: input.materialId } }
  execute: async (input) => ({
    ok: true,
    data: { id: input.id, slot: input.slot, materialId: input.materialId },
  }),
})

register({
  id: 'shape.hide',
  runsOn: 'client',
  label: 'Toggle layer visibility',
  description: 'Hide or show a shape on the canvas without deleting it.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    hidden: z.boolean(),
  }),
  outputSchema: z.object({
    id: z.string(),
    hidden: z.boolean(),
  }),
  voiceExamples: ['Hide the spa.', 'Show the deck.'],
  // CLIENT: useShapesStore.getState().updateShape(input.id, { hidden: input.hidden })
  execute: async (input) => ({ ok: true, data: { id: input.id, hidden: input.hidden } }),
})

register({
  id: 'shape.lock',
  runsOn: 'client',
  label: 'Toggle layer lock',
  description: 'Lock or unlock a shape so it cannot be moved or edited from the canvas.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    locked: z.boolean(),
  }),
  outputSchema: z.object({
    id: z.string(),
    locked: z.boolean(),
  }),
  voiceExamples: ['Lock the survey overlay.', 'Unlock the pool.'],
  // CLIENT: useShapesStore.getState().updateShape(input.id, { locked: input.locked })
  execute: async (input) => ({ ok: true, data: { id: input.id, locked: input.locked } }),
})

register({
  id: 'pool.depth.set',
  runsOn: 'client',
  label: 'Update pool depth profile',
  description:
    'Patch the depth profile of the selected pool. Depths are in FEET; sun-shelf and bubbler heights are in INCHES, since those are spoken in inches.',
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    shallowDepth: z.number().optional().describe('Shallow end depth in feet.'),
    deepDepth: z.number().optional().describe('Deep end depth in feet.'),
    slope: z.number().optional().describe('Floor slope, rise over run.'),
    sunShelfElevation: z.number().optional().describe('Sun shelf height above the floor, in inches.'),
    bubblerHeight: z.number().optional().describe('Bubbler height above the water, in inches.'),
  }),
  outputSchema: z.object({
    id: z.string(),
  }),
  voiceExamples: [
    'Raise the sun shelf two inches.',
    'Set the deep end to seven feet.',
  ],
  // CLIENT (Track E):
  //   patch.depthShallow / patch.depthDeep on the Shape;
  //   slope/sunShelfElevation/bubblerHeight live on DrawingObject.depthProfile
  //   (Wave 0 added the column). Persistence layer round-trips depthProfile.
  execute: async (input) => ({ ok: true, data: { id: input.id } }),
})

register({
  id: 'pool.trim.set',
  runsOn: 'client',
  label: 'Show or hide the pool trim',
  description:
    "Turn the pool's concrete coping border or its waterline tile band on or off. These are part of the pool itself rather than separate objects, so they cannot be deleted — this is how they come off.",
  category: 'shape',
  inputSchema: z.object({
    id: z.string(),
    coping: z.boolean().optional().describe('The concrete border around the pool edge.'),
    tileBand: z.boolean().optional().describe('The tile band at the waterline.'),
  }),
  outputSchema: z.object({
    id: z.string(),
    coping: z.boolean(),
    tileBand: z.boolean(),
  }),
  voiceExamples: [
    'Get rid of the concrete around the pool.',
    'Remove the coping.',
    'Put the coping back.',
    'Take the waterline tile off.',
  ],
  // CLIENT: merge into the shape's displayHint; SceneRoot reads it.
  execute: async input => ({
    ok: true,
    data: { id: input.id, coping: input.coping ?? true, tileBand: input.tileBand ?? true },
  }),
})

register({
  id: 'edit.undo',
  runsOn: 'client',
  label: 'Undo',
  description:
    'Undo the last change to the drawing. Use it as soon as something was done that the user did not want, rather than trying to reconstruct what was there.',
  category: 'canvas',
  inputSchema: z.object({}),
  outputSchema: z.object({ undone: z.boolean(), shapeCount: z.number() }),
  voiceExamples: ['Undo that.', 'Undo.', 'Put it back.', 'That was wrong, undo it.'],
  // CLIENT: useHistoryStore.getState().undo()
  execute: async () => ({ ok: true, data: { undone: false, shapeCount: 0 } }),
})

register({
  id: 'edit.redo',
  runsOn: 'client',
  label: 'Redo',
  description: 'Redo the change that was just undone.',
  category: 'canvas',
  inputSchema: z.object({}),
  outputSchema: z.object({ redone: z.boolean(), shapeCount: z.number() }),
  voiceExamples: ['Redo that.', 'Actually put it back.'],
  execute: async () => ({ ok: true, data: { redone: false, shapeCount: 0 } }),
})
