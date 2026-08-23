import type { z } from 'zod'

export type CommandCategory =
  | 'project'
  | 'canvas'
  | 'shape'
  | 'measurement'
  | 'pricing'
  | 'validation'
  | 'export'
  | 'template'
  | 'auth'
  | 'settings'
  | 'scene'
  | 'palette'
  | 'navigation'
  | 'context'
  | 'grade'
  | 'site'
  | 'import'
  | 'capture'
  | 'comment'

export type CommandContext = {
  userId: string
  orgId: string
  projectId?: string
}

export type CommandResult<T = unknown> =
  | { ok: true; data: T; undo?: () => Promise<void> }
  | { ok: false; error: string }

export type EditorCommand<I = unknown, O = unknown> = {
  id: string
  label: string
  description: string
  category: CommandCategory
  inputSchema: z.ZodType<I>
  outputSchema: z.ZodType<O>
  permission?: string
  voiceExamples?: string[]
  /**
   * Registered but not built yet: `execute` returns "not implemented".
   *
   * Declared rather than inferred so the voice layer can leave it out of the
   * spoken surface. A model handed a tool that always fails will keep trying
   * it, apologise, and try again, and the user hears the app claim it cannot do
   * something it never could.
   */
  unimplemented?: boolean
  /**
   * Where the work actually happens.
   *
   * `'client'` means the server `execute` only validates and echoes, and the
   * change is applied by a handler registered through `registerClientHandler`.
   * Declared rather than inferred so a test can prove the handler exists.
   *
   * This is the single most common defect in this codebase: a command that is
   * registered, offered to the voice agent, reports success, and does nothing.
   * It has shipped at least a dozen times — zoom, pan, fit, navigation, delete,
   * project creation — and every instance was found by a person using the app
   * and being told something happened that had not. A missing handler is now a
   * failing test rather than a confident lie.
   */
  runsOn?: 'server' | 'client'
  execute: (input: I, ctx: CommandContext) => Promise<CommandResult<O>>
}

const _registry = new Map<string, EditorCommand<unknown, unknown>>()

export function register<I, O>(cmd: EditorCommand<I, O>): void {
  if (_registry.has(cmd.id)) {
    throw new Error(`Command already registered: ${cmd.id}`)
  }
  _registry.set(cmd.id, cmd as EditorCommand<unknown, unknown>)
}

export function get(id: string): EditorCommand<unknown, unknown> | undefined {
  return _registry.get(id)
}

export function all(): EditorCommand<unknown, unknown>[] {
  return [..._registry.values()]
}

export function reset(): void {
  _registry.clear()
}
