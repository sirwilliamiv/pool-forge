export interface Hotkey {
  shortcut: string
  commandId: string
  description: string
  /** Optional static input passed to the command; overlaps with `commandId`. */
  input?: unknown
  /**
   * Fill the command's input from whatever is selected when the key is pressed.
   *
   * Static input cannot express "the thing the user is looking at", and three
   * entries here tried to anyway: they sent `{}` to commands requiring the
   * selection, were refused by their own schema, and did nothing at all.
   */
  fromSelection?: 'ids' | 'id'
  /** Fill `projectId` from the route, for commands scoped to one project. */
  needsProject?: boolean
}

// Keyboard shortcuts, mapped to commands in the registry.
// 'mod' means Cmd on macOS and Ctrl elsewhere.
//
// This table was written and never read: nothing in the app imported it, so
// every shortcut in the product did nothing at all, and six entries named
// commands that were never registered. `useHotkeys` is what listens now, and a
// test holds every entry against the registry so a shortcut cannot again
// advertise a command that does not exist.
export const HOTKEYS: Hotkey[] = [
  // Spec §14 tool shortcuts.
  { shortcut: 'v', commandId: 'tool.activate', description: 'Move tool', input: { tool: 'move' } },
  { shortcut: 'r', commandId: 'tool.activate', description: 'Pool shape tool', input: { tool: 'pool-shape' } },
  { shortcut: 's', commandId: 'tool.activate', description: 'Steps & shelves tool', input: { tool: 'steps' } },
  { shortcut: 'w', commandId: 'tool.activate', description: 'Water feature tool', input: { tool: 'water-feature' } },
  { shortcut: 'l', commandId: 'tool.activate', description: 'Lights tool', input: { tool: 'lights' } },
  { shortcut: 'd', commandId: 'tool.activate', description: 'Deck tool', input: { tool: 'deck' } },
  { shortcut: 'b', commandId: 'tool.activate', description: 'Material brush tool', input: { tool: 'material-brush' } },
  { shortcut: 'm', commandId: 'tool.activate', description: 'Measure tool', input: { tool: 'measure' } },
  { shortcut: 't', commandId: 'tool.activate', description: 'Annotation tool', input: { tool: 'annotation' } },
  { shortcut: 'c', commandId: 'tool.activate', description: 'Comment tool', input: { tool: 'comment' } },

  // Spec §14 navigation.
  { shortcut: 'h', commandId: 'tool.activate', description: 'Pan tool', input: { tool: 'pan' } },
  { shortcut: 'space', commandId: 'tool.activate', description: 'Hold to pan', input: { tool: 'pan' } },
  { shortcut: 'f', commandId: 'camera.frame.selection', description: 'Frame selection', input: {} },

  // Spec §14 view tabs (Plan / 3D / Section).
  { shortcut: '1', commandId: 'view.set.tab', description: 'Plan view', input: { tab: 'plan' } },
  { shortcut: '2', commandId: 'view.set.tab', description: '3D view', input: { tab: '3d' } },
  { shortcut: '3', commandId: 'view.set.tab', description: 'Section view', input: { tab: 'section' } },

  // Spec §14 deselect / close (Esc handled in the palette + selection components directly).
  { shortcut: 'escape', commandId: 'selection.set', description: 'Deselect', input: { ids: [] } },

  // Existing destructive / clipboard / history shortcuts (kept).
  { shortcut: 'delete', commandId: 'delete.shape', description: 'Delete selection', fromSelection: 'ids' },
  { shortcut: 'backspace', commandId: 'delete.shape', description: 'Delete selection', fromSelection: 'ids' },
  { shortcut: 'mod+d', commandId: 'duplicate.shape', description: 'Duplicate selection', fromSelection: 'id' },
  // These were 'history.undo' and 'history.redo', which are not command ids.
  // Wired as written, the one shortcut everybody reaches for would have
  // dispatched an unknown command and done nothing.
  { shortcut: 'mod+z', commandId: 'edit.undo', description: 'Undo' },
  { shortcut: 'mod+shift+z', commandId: 'edit.redo', description: 'Redo' },
  { shortcut: 'mod+y', commandId: 'edit.redo', description: 'Redo (Windows)' },
  // Copy, paste, group and ungroup were listed here and have no commands behind
  // them. Advertising a shortcut that cannot work is worse than not offering it,
  // so they are gone until the commands exist.

  // Existing zoom shortcuts (kept).
  { shortcut: '+', commandId: 'canvas.zoom.in', description: 'Zoom in' },
  { shortcut: '=', commandId: 'canvas.zoom.in', description: 'Zoom in (no shift)' },
  { shortcut: '-', commandId: 'canvas.zoom.out', description: 'Zoom out' },
  { shortcut: '0', commandId: 'canvas.fit', description: 'Fit to page' },

  // Spec §14 export shortcuts.
  { shortcut: 'mod+e', commandId: 'export.customerProposal', description: 'Export customer proposal', needsProject: true },
  { shortcut: 'mod+shift+e', commandId: 'export.constructionPacket', description: 'Export construction packet', needsProject: true },

  // Command palette open/close is handled inside CommandPalette directly so
  // the modal can manage its own focus state. We register an entry here so the
  // help / docs surface can list it.
  { shortcut: 'mod+k', commandId: 'palette.open', description: 'Open command palette' },
]

export function findHotkey(shortcut: string): Hotkey | undefined {
  return HOTKEYS.find((h) => h.shortcut === shortcut)
}
