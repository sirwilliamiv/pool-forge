import type { z } from 'zod'

export const COMMAND_CATEGORIES = [
  'project',
  'canvas',
  'shape',
  'measurement',
  'pricing',
  'validation',
  'export',
  'template',
  'auth',
  'settings',
  'scene',
  'palette',
  'navigation',
  'context',
  'grade',
  'site',
  'import',
  'capture',
  'comment',
  'sketch',
  'version',
  'guide',
] as const

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number]

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
  /**
   * What the audit row records instead of the raw input.
   *
   * `CommandAuditLog` keeps `inputJson` forever, which is exactly what makes it
   * the answer to "what did the user actually do". It is also why a command
   * whose input contains a secret cannot be audited raw: the credential
   * endpoints hand over a password somebody is choosing, and a password sitting
   * in a log table is a password that has leaked to anyone with SELECT on it.
   *
   * Declared per command rather than inferred, and typed on `unknown` rather
   * than `I`, because the audit write also happens on the path where the input
   * FAILED its schema and was never parsed. A redaction that only worked on
   * valid input would miss the "password too short" case, which is precisely the
   * one where a person's real password is in the payload.
   *
   * Commands without one are audited exactly as before.
   */
  redactForAudit?: (input: unknown) => unknown
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
