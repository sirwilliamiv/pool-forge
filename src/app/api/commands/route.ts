import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'

initCommands()

const requestSchema = z.object({
  id: z.string().min(1),
  input: z.unknown(),
})

async function writeAudit(args: {
  userId: string | null
  orgId: string | null
  commandId: string
  input: unknown
  result: CommandResult | { ok: false; error: string }
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
      },
    })
  } catch (err) {
    // Audit failure must not break the response. Log and continue.
    console.error('[commands] audit log write failed', err)
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: `invalid request: ${parsed.error.issues.map(i => i.message).join('; ')}` },
      { status: 400 },
    )
  }

  const { id, input } = parsed.data
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
    const result = { ok: false as const, error: `unknown command: ${id}` }
    await writeAudit({ userId, orgId, commandId: id, input, result })
    return NextResponse.json(result, { status: 404 })
  }

  const inputParsed = command.inputSchema.safeParse(input)
  if (!inputParsed.success) {
    const result = {
      ok: false as const,
      error: `invalid input: ${inputParsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    }
    await writeAudit({ userId, orgId, commandId: id, input, result })
    return NextResponse.json(result, { status: 400 })
  }

  const ctx: CommandContext = {
    userId: userId ?? 'anonymous',
    orgId: orgId ?? 'anonymous',
  }

  let result: CommandResult
  try {
    result = await command.execute(inputParsed.data, ctx)
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : 'unknown error' }
  }

  await writeAudit({ userId, orgId, commandId: id, input: inputParsed.data, result })
  return NextResponse.json(result)
}
