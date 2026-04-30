export interface Hotkey {
  shortcut: string
  commandId: string
  description: string
  /** Optional static input passed to the command; overlaps with `commandId`. */
  input?: unknown
}

// Maps spec §14 keyboard shortcuts to commands in the registry.
// The shortcut string uses 'mod' to mean Cmd on macOS / Ctrl elsewhere.
//
// Tool activations (V/R/S/W/L/D/B/M/T/C) dispatch through `tool.activate` with
// a `tool` input. Track G is expected to register `tool.activate`; until then
// the dispatch records the audit row and the `useEditorStore` listener wires
// the active-tool change.
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
  { shortcut: 'delete', commandId: 'delete.shape', description: 'Delete selection' },
  { shortcut: 'backspace', commandId: 'delete.shape', description: 'Delete selection' },
  { shortcut: 'mod+c', commandId: 'shape.copy', description: 'Copy selection' },
  { shortcut: 'mod+v', commandId: 'shape.paste', description: 'Paste' },
  { shortcut: 'mod+d', commandId: 'duplicate.shape', description: 'Duplicate selection' },
  { shortcut: 'mod+z', commandId: 'history.undo', description: 'Undo' },
  { shortcut: 'mod+shift+z', commandId: 'history.redo', description: 'Redo' },
  { shortcut: 'mod+g', commandId: 'shape.group', description: 'Group selection' },
  { shortcut: 'mod+shift+g', commandId: 'shape.ungroup', description: 'Ungroup selection' },

  // Existing zoom shortcuts (kept).
  { shortcut: '+', commandId: 'canvas.zoom.in', description: 'Zoom in' },
  { shortcut: '=', commandId: 'canvas.zoom.in', description: 'Zoom in (no shift)' },
  { shortcut: '-', commandId: 'canvas.zoom.out', description: 'Zoom out' },
  { shortcut: '0', commandId: 'canvas.fit', description: 'Fit to page' },

  // Spec §14 export shortcuts.
  { shortcut: 'mod+e', commandId: 'export.customerProposal', description: 'Export customer proposal' },
  { shortcut: 'mod+shift+e', commandId: 'export.constructionPacket', description: 'Export construction packet' },

  // Command palette open/close is handled inside CommandPalette directly so
  // the modal can manage its own focus state. We register an entry here so the
  // help / docs surface can list it.
  { shortcut: 'mod+k', commandId: 'palette.open', description: 'Open command palette' },
]

export function findHotkey(shortcut: string): Hotkey | undefined {
  return HOTKEYS.find((h) => h.shortcut === shortcut)
}
