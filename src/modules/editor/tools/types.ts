export type ToolCategory =
  | 'selection'
  | 'drawing'
  | 'transform'
  | 'measurement'
  | 'pricing'
  | 'export'

export interface Tool {
  id: string
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
