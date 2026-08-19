// Server-side command dispatch with the audit write attached.
//
// `/api/commands` is the browser's entry point; routes that accept something a
// JSON body cannot carry (an uploaded file, a webhook payload) are a second
// entry point. `CLAUDE.md` requires every entry point to write the same
// `CommandAuditLog` row, so the shared behaviour lives here rather than being
// copied and drifting.

import { get } from './registry'
import type { CommandContext, CommandResult } from './registry'

const ANONYMOUS = 'anonymous'

function identity(value: string | undefined): string | null {
  if (!value || value === ANONYMOUS) return null
  return value
}

async function writeAudit(args: {
  commandId: string
  ctx: CommandContext
  input: unknown
  result: CommandResult
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
      },
    })
  } catch (err) {
    // An audit failure must not break the response.
    console.error('[commands] audit log write failed', err)
  }
}

/**
 * Validates input against the command's schema, executes it, validates the
 * output, and writes exactly one audit row whatever the outcome.
 */
export async function dispatchCommand<T = unknown>(
  commandId: string,
  input: unknown,
  ctx: CommandContext,
): Promise<CommandResult<T>> {
  const command = get(commandId)
  if (!command) {
    const result = { ok: false as const, error: `unknown command: ${commandId}` }
    await writeAudit({ commandId, ctx, input, result })
    return result
  }

  const parsed = command.inputSchema.safeParse(input)
  if (!parsed.success) {
    const result = {
      ok: false as const,
      error: `invalid input: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    }
    await writeAudit({ commandId, ctx, input, result })
    return result
  }

  let result: CommandResult
  try {
    result = await command.execute(parsed.data, ctx)
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : 'unknown error' }
  }

  await writeAudit({ commandId, ctx, input: parsed.data, result })
  return result as CommandResult<T>
}
