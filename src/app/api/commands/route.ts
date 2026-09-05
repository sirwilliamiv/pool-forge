import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  COMMAND_SOURCES,
  DEFAULT_COMMAND_SOURCE,
  type CommandSourceValue,
} from '@/modules/commands/source'
import {
  humanCommandCrashError,
  humanCommandInputError,
  humanUnknownCommandError,
  technicalIssueList,
} from '@/lib/commands/errors'
import { captureError } from '@/modules/monitoring'
import { initCommands } from '@/modules/commands/init'
import { auditableInput } from '@/modules/commands/dispatch'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'

initCommands()

const requestSchema = z.object({
  id: z.string().min(1),
  input: z.unknown(),
  /**
   * How the caller triggered this.
   *
   * A hint from the client, so it is treated as one: it labels the audit row and
   * nothing else. It grants no permission and changes no behaviour, which is why
   * an unrecognised value is simply ignored rather than rejected.
   */
  source: z.enum(COMMAND_SOURCES).optional(),
})

/**
 * Record one audit row without making the caller wait on it.
 *
 * The editor dispatches through this route on every add/move/resize/delete,
 * and the client applies the visible change only after this POST resolves, so
 * awaiting the INSERT put a DB round trip in front of every edit. The audit is
 * best-effort (it already swallows its own failures), so the write is handed to
 * `after()`: the response returns immediately and the runtime is kept alive to
 * finish the insert past the response.
 */
function recordAudit(args: {
  userId: string | null
  orgId: string | null
  commandId: string
  input: unknown
  result: CommandResult | { ok: false; error: string }
  source: CommandSourceValue
}): void {
  after(writeAudit(args))
}

async function writeAudit(args: {
  userId: string | null
  orgId: string | null
  commandId: string
  input: unknown
  result: CommandResult | { ok: false; error: string }
  source: CommandSourceValue
}): Promise<void> {
  try {
    await db.commandAuditLog.create({
      data: {
        userId: args.userId,
        orgId: args.orgId,
        commandId: args.commandId,
        inputJson: (args.input ?? {}) as object,
        outputJson: (args.result.ok ? args.result.data : {}) as object,
        success: args.result.ok,
        errorMessage: args.result.ok ? null : args.result.error,
        source: args.source,
      },
    })
  } catch (err) {
    // Audit failure must not break the response. Log and continue.
    console.error('[commands] audit log write failed', err)
  }
}

export async function POST(req: Request): Promise<Response> {
  // These two are malformed requests rather than bad user input, so there is no
  // command to name, but the string still ends up in a toast, so it is still a
  // sentence rather than a parser's complaint.
  const MALFORMED =
    'Pool Forge could not send that action to the server. Nothing was changed. Please try again.'

  let body: unknown
  try {
    body = await req.json()
  } catch {
    console.warn('[commands] request body was not JSON')
    return NextResponse.json({ ok: false, error: MALFORMED }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    console.warn(
      `[commands] malformed request: ${parsed.error.issues.map(i => i.message).join('; ')}`,
    )
    return NextResponse.json({ ok: false, error: MALFORMED }, { status: 400 })
  }

  const { id, input } = parsed.data
  const source = parsed.data.source ?? DEFAULT_COMMAND_SOURCE
  const command = get(id)

  // Resolve session (Track B may not be wired up yet — fall back gracefully).
  let userId: string | null = null
  let orgId: string | null = null
  try {
    const session = await auth()
    userId = session?.user?.id ?? null
    orgId = session?.user?.orgId ?? null
  } catch {
    // Auth not yet configured — treat as anonymous.
  }

  if (!command) {
    // Two audiences, two messages: the audit row keeps the id that was asked
    // for, the response carries a sentence rather than an internal identifier.
    recordAudit({
      userId,
      orgId,
      commandId: id,
      input,
      result: { ok: false, error: `unknown command: ${id}` },
      source,
    })
    return NextResponse.json(
      { ok: false, error: humanUnknownCommandError() },
      { status: 404 },
    )
  }

  const inputParsed = command.inputSchema.safeParse(input)
  if (!inputParsed.success) {
    // The Zod issue list is a developer's sentence, and it used to be shown to
    // the user in a toast. It stays here, where it is useful, and the response
    // carries the plain-English half.
    const technical = technicalIssueList(inputParsed.error)
    console.warn(`[commands] ${id} refused its input: ${technical}`)
    recordAudit({
      userId,
      orgId,
      commandId: id,
      input: auditableInput(command, input),
      result: { ok: false, error: `invalid input: ${technical}` },
      source,
    })
    return NextResponse.json(
      { ok: false, error: humanCommandInputError(command.label, inputParsed.error, input) },
      { status: 400 },
    )
  }

  const ctx: CommandContext = {
    userId: userId ?? 'anonymous',
    orgId: orgId ?? 'anonymous',
  }

  let result: CommandResult
  // Two audiences again. A thrown error's own message can quote the row it
  // choked on, so it never reaches the browser; it is captured, redacted and
  // logged against a ref, the caller gets a sentence carrying that ref, and the
  // audit row records the ref rather than the generic copy so the two can be
  // joined later.
  let auditResult: CommandResult | { ok: false; error: string }
  try {
    result = await command.execute(inputParsed.data, ctx)
    auditResult = result
  } catch (err) {
    const report = captureError({
      error: err,
      code: 'command_execute',
      origin: 'server',
      route: `/api/commands/${id}`,
      userId,
      orgId,
    })
    result = { ok: false, error: humanCommandCrashError(command.label, report.errorRef) }
    auditResult = { ok: false, error: `command threw (${report.errorRef}): ${report.name}` }
  }

  recordAudit({
    userId,
    orgId,
    commandId: id,
    input: auditableInput(command, inputParsed.data),
    result: auditResult,
    source,
  })
  return NextResponse.json(result)
}
