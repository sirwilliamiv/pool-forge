// What the command palette offers, as data rather than as JSX.
//
// The palette used to build its rows inline in the component, and every "Add …"
// row sent `{ kind: 'waterfall' }` to `add.shape`, whose schema has always asked
// for `{ stencilId, x, y }`. Nothing checked, because the only thing that could
// have checked was a person clicking the row. A first-time user clicked two of
// them: one showed a raw Zod message, the other looked like it did nothing.
//
// So the rows live here, each one declaring the command it dispatches and
// building that command's input from the current canvas. A test walks this list
// and parses every input with the registered command's own schema, which is the
// exact check that was missing.
//
// Client-safe: no Prisma, no server-only imports. The palette is a client
// component and imports this directly.

import { stagedCount, stagingPlacement } from '@/modules/editor/placement'
import type { Shape } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { EXPORT_COMMAND_IDS, type ExportCommandId } from '@/modules/exports/routes'

/** Everything a row needs to turn itself into a concrete command call. */
export interface PaletteRowContext {
  shapes: Shape[]
  projectId: string
}

export interface PaletteDispatch {
  commandId: string
  input: Record<string, unknown>
}

export type PaletteGroup = 'add' | 'action'

/**
 * How the row reaches the command.
 *
 * 'command' awaits the round-trip and reports the result. 'export' has to run
 * inside the click gesture, or the popup blocker eats the tab it opens.
 */
export type PaletteVia = 'command' | 'export'

export interface PaletteRow {
  id: string
  label: string
  description?: string
  shortcut?: string
  group: PaletteGroup
  via: PaletteVia
  /**
   * Said back to the user on success, so a working row never looks silent.
   *
   * Given the last call's result data when it is a function, so a row can
   * report what actually came back rather than a fixed sentence that might not
   * be true.
   */
  successMessage?: string | ((data: unknown) => string)
  /**
   * The calls this row makes, in order.
   *
   * An empty array means the row cannot do anything useful right now (nothing
   * to act on), and it is not offered at all. A row that is offered runs.
   */
  build(ctx: PaletteRowContext): PaletteDispatch[]
}

/**
 * Stage `count` copies of a stencil beside whatever is already drawn.
 *
 * The coordinates are the point. `add.shape` places at a position, and the
 * palette has no pointer to take one from, so it uses the same staging block
 * the stencil panel uses rather than sending nothing and hoping.
 */
function stage(stencilId: string, count = 1) {
  return (ctx: PaletteRowContext): PaletteDispatch[] => {
    const staged = stagedCount(ctx.shapes)
    return Array.from({ length: count }, (_, i) => {
      const { x, y } = stagingPlacement(ctx.shapes, stencilId, staged + i)
      return { commandId: 'add.shape', input: { stencilId, x, y } }
    })
  }
}

/** The catalogue name, so a row's wording and the layer it creates agree. */
function stencilName(stencilId: string): string {
  return getStencil(stencilId)?.name ?? stencilId
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

const ADD_ROWS: PaletteRow[] = [
  {
    id: 'add.tanning-ledge',
    label: 'Add a tanning ledge',
    description: 'Places a sun shelf beside the design',
    group: 'add',
    via: 'command',
    successMessage: `${stencilName('feature.tanning-ledge')} added. It is in the Layers list, ready to move.`,
    build: stage('feature.tanning-ledge'),
  },
  {
    id: 'add.waterfall',
    label: 'Add a waterfall',
    description: 'Places a waterfall beside the design',
    group: 'add',
    via: 'command',
    successMessage: `${stencilName('water.waterfall')} added. It is in the Layers list, ready to move.`,
    build: stage('water.waterfall'),
  },
  {
    id: 'add.two-lights',
    label: 'Add 2 LED lights',
    description: 'Places two pool lights beside the design',
    group: 'add',
    via: 'command',
    successMessage: '2 lights added. They are in the Layers list, ready to move.',
    build: stage('feature.light', 2),
  },
  {
    id: 'add.rectangle-pool',
    label: 'Add a rectangle pool',
    description: 'Places a 30′ × 14′ rectangular pool',
    group: 'add',
    via: 'command',
    successMessage: 'Rectangle pool added. Click it in the Layers list to set its size.',
    build: stage('pool.rectangle'),
  },
]

const ACTION_ROWS: PaletteRow[] = [
  {
    id: 'action.export.proposal',
    label: 'Export customer proposal',
    description: 'Opens the printable proposal in a new tab',
    shortcut: '⌘E',
    group: 'action',
    via: 'export',
    build: ctx => [
      { commandId: 'export.customerProposal', input: { projectId: ctx.projectId } },
    ],
  },
  {
    id: 'action.export.construction',
    label: 'Export construction packet (11×17)',
    description: 'Opens the builder packet in a new tab',
    shortcut: '⌘⇧E',
    group: 'action',
    via: 'export',
    build: ctx => [
      {
        commandId: 'export.constructionPacket',
        input: { projectId: ctx.projectId, pageSize: 'tabloid' },
      },
    ],
  },
  {
    id: 'action.export.sitePlan',
    label: 'Export site plan',
    description: 'Opens the site plan sheet in a new tab',
    group: 'action',
    via: 'export',
    build: ctx => [{ commandId: 'export.sitePlan', input: { projectId: ctx.projectId } }],
  },
  {
    id: 'action.export.screenRfq',
    label: 'Export screen enclosure quote request',
    description: 'Opens the screen vendor request in a new tab',
    group: 'action',
    via: 'export',
    build: ctx => [
      { commandId: 'export.screenEnclosureQuote', input: { projectId: ctx.projectId } },
    ],
  },
  {
    id: 'action.run.validation',
    label: 'Check this design against the rules',
    description: 'Re-runs the checklist in the bottom right',
    group: 'action',
    via: 'command',
    // The counts that came back, not a promise that something happened: the
    // checklist panel is rendered from the page's own data and does not refresh
    // on its own, so the toast is where the fresh answer is.
    successMessage: data => {
      const counts = data as { errors?: number; warnings?: number; passes?: number } | null
      const errors = counts?.errors ?? 0
      const warnings = counts?.warnings ?? 0
      const passes = counts?.passes ?? 0
      return `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${passes} passed.`
    },
    build: ctx => [{ commandId: 'run.validation', input: { projectId: ctx.projectId } }],
  },
  {
    id: 'action.camera.iso',
    label: 'Reset the camera to the angled view',
    description: 'Points the camera back at the design',
    group: 'action',
    via: 'command',
    successMessage: 'Camera reset.',
    build: () => [{ commandId: 'camera.set.view', input: { view: 'iso' } }],
  },
]

export const PALETTE_ROWS: PaletteRow[] = [...ADD_ROWS, ...ACTION_ROWS]

export function isExportRow(row: PaletteRow): row is PaletteRow & { via: 'export' } {
  return row.via === 'export'
}

/** Narrow a declared export row's command id back to the export union. */
export function asExportCommandId(commandId: string): ExportCommandId | null {
  return (EXPORT_COMMAND_IDS as readonly string[]).includes(commandId)
    ? (commandId as ExportCommandId)
    : null
}
