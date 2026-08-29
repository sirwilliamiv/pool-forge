export type ToolCategory =
  | 'selection'
  | 'drawing'
  | 'transform'
  | 'measurement'
  | 'pricing'
  | 'export'

/**
 * Whether this tool is in the app or still a design note.
 *
 * The catalogue was written ahead of the editor and drifted: it described 51
 * tools, the toolbar exposed 12, and exactly 3 ids appeared in both. So the
 * reference page listed 48 tools nobody could use and omitted 9 that worked,
 * and its voice examples taught the agent to ask for things that do not exist.
 *
 * Declared rather than inferred, and checked by a test against the real toolbar,
 * so the two cannot drift apart again in silence.
 */
export type ToolStatus = 'built' | 'planned'

export interface Tool {
  id: string
  status: ToolStatus
  name: string
  icon: string
  tooltip: string
  shortcut: string | null
  description: string
  category: ToolCategory
  inputs: string[]
  outputs: string[]
  sideEffects: string[]
  errorStates: string[]
  undoBehavior: string
  voiceCommandExamples: string[]
}
