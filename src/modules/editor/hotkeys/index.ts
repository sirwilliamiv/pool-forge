export interface Hotkey {
  shortcut: string
  commandId: string
  description: string
}

// Maps brief §3 keyboard shortcuts to commands in the registry.
// The shortcut string uses 'mod' to mean Cmd on macOS / Ctrl elsewhere.
export const HOTKEYS: Hotkey[] = [
  { shortcut: 'v', commandId: 'tool.select', description: 'Select tool' },
  { shortcut: 'h', commandId: 'tool.pan', description: 'Pan tool' },
  { shortcut: 'space', commandId: 'tool.pan', description: 'Hold to pan' },

  { shortcut: 'delete', commandId: 'delete.shape', description: 'Delete selection' },
  { shortcut: 'backspace', commandId: 'delete.shape', description: 'Delete selection' },

  { shortcut: 'mod+c', commandId: 'shape.copy', description: 'Copy selection' },
  { shortcut: 'mod+v', commandId: 'shape.paste', description: 'Paste' },
  { shortcut: 'mod+d', commandId: 'duplicate.shape', description: 'Duplicate selection' },

  { shortcut: 'mod+z', commandId: 'history.undo', description: 'Undo' },
  { shortcut: 'mod+shift+z', commandId: 'history.redo', description: 'Redo' },

  { shortcut: 'mod+g', commandId: 'shape.group', description: 'Group selection' },
  { shortcut: 'mod+shift+g', commandId: 'shape.ungroup', description: 'Ungroup selection' },

  { shortcut: '+', commandId: 'canvas.zoomIn', description: 'Zoom in' },
  { shortcut: '=', commandId: 'canvas.zoomIn', description: 'Zoom in (no shift)' },
  { shortcut: '-', commandId: 'canvas.zoomOut', description: 'Zoom out' },
  { shortcut: '0', commandId: 'canvas.fitToPage', description: 'Fit to page' },
]

export function findHotkey(shortcut: string): Hotkey | undefined {
  return HOTKEYS.find((h) => h.shortcut === shortcut)
}
