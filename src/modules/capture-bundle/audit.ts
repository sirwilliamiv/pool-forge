// The audit write for the mobile capture surface.
//
// `CLAUDE.md`: every command entry point writes the same `CommandAuditLog`
// row, and `/api/commands` handles it centrally for the web app. The mobile
// routes are a second entry point - bearer-authed, no browser session, and
// their work (a Turso write, a GCS upload session) is not a registered
// command - so this replicates `writeAudit` from
// `src/modules/commands/dispatch.ts` with the same columns, the same
// "an audit failure must not break the response" stance, and `source: 'API'`,
// which is what distinguishes a phone's action from a click in the log.
//
// Nothing secret goes in: the tokens route logs that a token was minted,
// never the token, exactly as `src/modules/auth/tokens.ts` keeps invite links
// out of this table.

import type { CommandSourceValue } from '@/modules/commands/source'

const MOBILE_SOURCE: CommandSourceValue = 'API'

export async function writeMobileAudit(args: {
  commandId: string
  orgId: string | null
  userId: string | null
  input: unknown
  ok: boolean
  output?: unknown
  error?: string
}): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    await db.commandAuditLog.create({
      data: {
        userId: args.userId,
        orgId: args.orgId,
        commandId: args.commandId,
        inputJson: (args.input ?? {}) as object,
        outputJson: (args.ok ? (args.output ?? {}) : {}) as object,
        success: args.ok,
        errorMessage: args.ok ? null : (args.error ?? 'unknown error'),
        source: MOBILE_SOURCE,
      },
    })
  } catch (err) {
    // An audit failure must not break the response.
    console.error('[capture-bundle] audit log write failed', err)
  }
}
