/**
 * The ids of the tools a user can actually have active on the canvas.
 *
 * These are the ids the Toolbar renders, the ids ToolGestures and DragHandler
 * branch on, and the ids stored in `editorStore.activeTool`. They are not the
 * same list as the documentation catalogue in `src/modules/editor/tools` — that
 * one describes planned tools for the docs page and the voice examples.
 *
 * The hotkey table dispatches `tool.activate` with the bare names ('move',
 * 'steps', 'measure'), while the Toolbar dispatches the prefixed ids. Both have
 * to end up at the same value or the keyboard silently does nothing: pressing M
 * would set activeTool to 'measure', which ToolGestures never matches, so
 * clicking the canvas measures nothing and no error is raised anywhere.
 */

export const EDITOR_TOOL_IDS = [
  'tool.select',
  'tool.pan',
  'tool.pool-shape',
  'tool.steps',
  'tool.water-feature',
  'tool.lights',
  'tool.deck',
  'tool.material-brush',
  'tool.measure',
  'tool.annotation',
  'tool.comment',
] as const

export type EditorToolId = (typeof EDITOR_TOOL_IDS)[number]

const CANONICAL = new Set<string>(EDITOR_TOOL_IDS)

/**
 * Names that mean an existing tool but are not spelled like its id.
 * 'move' is the Toolbar's label for the select tool and the name the V hotkey
 * sends; 'select' is the pre-prefix spelling still accepted from older payloads.
 */
const ALIASES: Record<string, EditorToolId> = {
  move: 'tool.select',
  select: 'tool.select',
  'tool.move': 'tool.select',
}

/**
 * Canonical id for whatever a caller passed: prefixed id, bare name, or alias.
 * Unrecognised ids are returned untouched so a typo stays visible instead of
 * quietly becoming the select tool.
 */
export function normalizeToolId(raw: string): string {
  const key = raw.trim().toLowerCase()
  const alias = ALIASES[key]
  if (alias) return alias
  if (CANONICAL.has(key)) return key
  const prefixed = `tool.${key}`
  if (CANONICAL.has(prefixed)) return prefixed
  return raw
}

/** True when `raw` names a tool the canvas actually implements. */
export function isEditorToolId(raw: string): raw is EditorToolId {
  return CANONICAL.has(normalizeToolId(raw))
}
