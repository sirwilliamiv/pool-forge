import { z } from 'zod'
import { register } from '@/modules/commands/registry'

// Canvas/view/camera/mode/selection commands all mutate client-only Zustand
// state. The server `execute` validates input and returns a success
// envelope; the consuming track registers a client handler that performs
// the actual mutation (see src/lib/commands/dispatch.ts).

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
  // CLIENT: useEditorStore.getState().setZoom(z * (input.step ?? 1.2))
  execute: async () => ({ ok: true, data: { zoom: 0 } }),
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
  // CLIENT: useEditorStore.getState().setZoom(z / (input.step ?? 1.2))
  execute: async () => ({ ok: true, data: { zoom: 0 } }),
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
  // CLIENT: compute bbox of all shapes, set zoom + pan to fit viewport.
  execute: async () => ({ ok: true, data: { zoom: 0 } }),
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
  // CLIENT: useEditorStore.getState().panBy(input.dx, input.dy)
  execute: async (input) => ({ ok: true, data: { x: input.dx, y: input.dy } }),
})

register({
  id: 'selection.set',
  label: 'Set selection',
  description: 'Replace the current selection with the given shape ids.',
  category: 'canvas',
  inputSchema: z.object({
    ids: z.array(z.string()),
  }),
  outputSchema: z.object({
    selectedIds: z.array(z.string()),
  }),
  voiceExamples: [
    'Select the pool.',
    'Clear my selection.',
  ],
  // CLIENT (Track D SelectionPicker / Track E inspector):
  //   if (input.ids.length === 0) useSelectionStore.getState().clear();
  //   else useSelectionStore.getState().selectMany(input.ids);
  execute: async (input) => ({ ok: true, data: { selectedIds: input.ids } }),
})

register({
  id: 'camera.set.view',
  label: 'Snap camera to view',
  description: 'Snap the camera to a canonical view (top, front, left, right, iso).',
  category: 'canvas',
  inputSchema: z.object({
    view: z.enum(['top', 'front', 'left', 'right', 'iso']),
  }),
  outputSchema: z.object({
    view: z.enum(['top', 'front', 'left', 'right', 'iso']),
  }),
  voiceExamples: [
    'Show top view.',
    'Iso view.',
  ],
  // CLIENT (Track F ViewCube): useCameraStore.getState().setView(input.view)
  execute: async (input) => ({ ok: true, data: { view: input.view } }),
})

register({
  id: 'camera.frame.selection',
  label: 'Frame selection',
  description: 'Frame the current selection in the viewport.',
  category: 'canvas',
  inputSchema: z.object({}),
  outputSchema: z.object({
    framed: z.boolean(),
  }),
  voiceExamples: [
    'Frame the selection.',
    'Zoom to selection.',
  ],
  // CLIENT (Track B CustomOrbit): compute bbox of selection in scene,
  //   move camera target to bbox center, scale distance to fit.
  //   Returns { framed: true } if there was a selection, false otherwise.
  execute: async () => ({ ok: true, data: { framed: true } }),
})

register({
  id: 'mode.set.presentation',
  label: 'Set presentation mode',
  description: 'Switch the presentation mode (plan, design, build, customer).',
  category: 'canvas',
  inputSchema: z.object({
    mode: z.enum(['plan', 'design', 'build', 'customer']),
  }),
  outputSchema: z.object({
    mode: z.enum(['plan', 'design', 'build', 'customer']),
  }),
  voiceExamples: [
    'Switch to build mode.',
    'Show me the customer view.',
  ],
  // CLIENT (Track F ModePillContainer):
  //   useViewStore.getState().setPresentationMode(input.mode)
  execute: async (input) => ({ ok: true, data: { mode: input.mode } }),
})

register({
  id: 'tool.activate',
  label: 'Activate tool',
  description: 'Set the active editor tool by id (matches Toolbar IDs / hotkeys).',
  category: 'canvas',
  inputSchema: z.object({
    tool: z.string(),
  }),
  outputSchema: z.object({
    tool: z.string(),
  }),
  voiceExamples: [
    'Pick the move tool.',
    'Switch to the measure tool.',
  ],
  // CLIENT (Track H hotkeys / Track F Toolbar):
  //   useEditorStore.getState().setActiveTool(input.tool)
  execute: async (input) => ({ ok: true, data: { tool: input.tool } }),
})

register({
  id: 'view.set.tab',
  label: 'Set view tab',
  description: 'Switch the canvas view tab (plan, 3d, section).',
  category: 'canvas',
  inputSchema: z.object({
    tab: z.enum(['plan', '3d', 'section']),
  }),
  outputSchema: z.object({
    tab: z.enum(['plan', '3d', 'section']),
  }),
  voiceExamples: [
    'Switch to plan view.',
    'Show the section cut.',
  ],
  // CLIENT (Track A LeftPanel view tabs):
  //   useViewStore.getState().setViewMode(input.tab)
  execute: async (input) => ({ ok: true, data: { tab: input.tab } }),
})

register({
  id: 'scene.describe',
  label: 'Describe what is on the canvas',
  description:
    'Read back everything currently on the canvas: each object with its id, name, kind, position and size in inches, plus which objects are selected. Call this before moving, resizing, deleting or positioning anything relative to something else. Every other command needs an id, and this is the only way to learn one.',
  category: 'canvas',
  inputSchema: z.object({
    includeHidden: z.boolean().optional(),
  }),
  outputSchema: z.object({
    count: z.number(),
    selectedIds: z.array(z.string()),
    shapes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.string(),
        stencilId: z.string().nullable(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        rotation: z.number(),
        locked: z.boolean(),
        hidden: z.boolean(),
      }),
    ),
    bounds: z
      .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
      .nullable(),
  }),
  voiceExamples: [
    'What is on the canvas?',
    'What have we got so far?',
    'Where is the pool?',
    'How big is the deck?',
  ],
  // The only read in the registry, and the reason the rest are usable by voice:
  // every mutating command takes an id, and without a way to list what exists
  // the agent can add objects forever but never touch one again. Positioning is
  // the same problem — "a deck around the pool" needs the pool's actual extent,
  // not a guess at the origin.
  //
  // CLIENT: read useShapesStore/useSelectionStore and return the summary.
  execute: async () => ({ ok: true, data: { count: 0, selectedIds: [], shapes: [], bounds: null } }),
})
