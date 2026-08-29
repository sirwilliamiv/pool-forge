// Server-side command dispatch with the audit write attached.
//
// `/api/commands` is the browser's entry point; routes that accept something a
// JSON body cannot carry (an uploaded file, a webhook payload) are a second
// entry point. `CLAUDE.md` requires every entry point to write the same
// `CommandAuditLog` row, so the shared behaviour lives here rather than being
// copied and drifting.

import {
  humanCommandInputError,
  humanUnknownCommandError,
  technicalIssueList,
} from '@/lib/commands/errors'
import { get } from './registry'
import type { CommandContext, CommandResult, EditorCommand } from './registry'
import { DEFAULT_COMMAND_SOURCE, type CommandSourceValue } from './source'

const ANONYMOUS = 'anonymous'

/**
 * What the audit row is allowed to keep.
 *
 * Applied on BOTH audit paths, including the one where the input failed its
 * schema and was never parsed, because that is the path a password too short by
 * one character takes. A redaction that only ran on valid input would be a
 * redaction that missed the case it exists for.
 */
export function auditableInput(
  command: EditorCommand<unknown, unknown> | undefined,
  input: unknown,
): unknown {
  if (!command?.redactForAudit) return input
  try {
    return command.redactForAudit(input)
  } catch {
    // A redactor that throws must not be the reason the secret gets logged.
    return { redacted: true }
  }
}

function identity(value: string | undefined): string | null {
  if (!value || value === ANONYMOUS) return null
  return value
}

async function writeAudit(args: {
  commandId: string
  ctx: CommandContext
  input: unknown
  result: CommandResult
  source: CommandSourceValue
}): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    await db.commandAuditLog.create({
      data: {
        userId: identity(args.ctx.userId),
        orgId: identity(args.ctx.orgId),
        commandId: args.commandId,
        inputJson: (args.input ?? {}) as object,
        outputJson: (args.result.ok ? args.result.data : {}) as object,
        success: args.result.ok,
        errorMessage: args.result.ok ? null : args.result.error,
        source: args.source,
      },
    })
  } catch (err) {
    // An audit failure must not break the response.
    console.error('[commands] audit log write failed', err)
  }
}

let registryReady = false

/**
 * Make sure the registry is populated before anything is looked up in it.
 *
 * Registration happens as a side effect of importing the category modules, so a
 * caller that dispatches without having imported them finds an empty map and is
 * told "that action is not available in this version of Pool Forge" for a
 * command that exists. Every entry point used to have to remember `initCommands`
 * for itself, and this file exists precisely because "remember to do the same
 * thing at every entry point" is how the audit row got missed in the first place.
 *
 * A dynamic import rather than a static one: `init` pulls in every category, and
 * a category is free to import a domain module that eventually reaches back here.
 * Loading it lazily means that cannot become an import cycle.
 */
async function ensureRegistry(): Promise<void> {
  if (registryReady) return
  const { initCommands } = await import('./init')
  initCommands()
  registryReady = true
}

/**
 * Validates input against the command's schema, executes it, validates the
 * output, and writes exactly one audit row whatever the outcome.
 */
export async function dispatchCommand<T = unknown>(
  commandId: string,
  input: unknown,
  ctx: CommandContext,
  source: CommandSourceValue = DEFAULT_COMMAND_SOURCE,
): Promise<CommandResult<T>> {
  await ensureRegistry()
  // Both failures below carry two messages: the audit row keeps the developer's
  // version (which id, which field), and the returned error is the one a person
  // is shown. They used to be the same string, and it was the Zod issue list.
  const command = get(commandId)
  if (!command) {
    await writeAudit({
      commandId,
      ctx,
      input,
      result: { ok: false, error: `unknown command: ${commandId}` },
      source,
    })
    return { ok: false, error: humanUnknownCommandError() }
  }

  const parsed = command.inputSchema.safeParse(input)
  if (!parsed.success) {
    const technical = technicalIssueList(parsed.error)
    console.warn(`[commands] ${commandId} refused its input: ${technical}`)
    await writeAudit({
      commandId,
      ctx,
      input: auditableInput(command, input),
      result: { ok: false, error: `invalid input: ${technical}` },
      source,
    })
    return { ok: false, error: humanCommandInputError(command.label, parsed.error, input) }
  }

  let result: CommandResult
  try {
    result = await command.execute(parsed.data, ctx)
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : 'unknown error' }
  }

  await writeAudit({
    commandId,
    ctx,
    input: auditableInput(command, parsed.data),
    result,
    source,
  })
  return result as CommandResult<T>
}
