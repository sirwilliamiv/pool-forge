// Team management, as commands.
//
// `CLAUDE.md` is not negotiable about this: a button that changes data goes
// through the registry, so that "who made Sam an owner, and when" has an answer
// in `CommandAuditLog` rather than in nobody's memory. Granting roles and
// removing people is exactly the kind of change that gets asked about later.
//
// TWO THINGS THESE COMMANDS DELIBERATELY DO NOT ACCEPT
//
// A raw one-time token, and a password. Both are live credentials and both would
// otherwise be written to `inputJson` and kept forever.
//
//   - Invites and reset links: the CALLER mints the token and passes only its
//     sha256. The command stores that hash, the audit row records that hash, and
//     the raw value exists only in the action's local variable and in whatever
//     the action does with it, which is send an email or show it once.
//
//   - Acceptance and reset completion genuinely need the password, so those two
//     carry `redactForAudit` and the audit row keeps a hash of the link and
//     nothing else.
//
// NO `voiceExamples`, ANYWHERE IN THIS FILE
//
// The voice tool surface is derived from commands that have them, so leaving
// them off is what keeps the agent from being offered these at all. That is the
// intent. "Make Sam an owner" is a sentence a model can mishear into handing
// somebody the keys to a business, and there is no undo on a stranger reading
// your price book.

import { createHash } from 'node:crypto'
import { z } from 'zod'

import { register } from '@/modules/commands/registry'
import {
  acceptInvite,
  createInvite,
  revokeInvite,
} from '@/modules/invites/invites'
import { removeMember, sendMemberPasswordReset, setMemberRole } from '@/modules/invites/team'
import { completePasswordReset } from '@/modules/auth/password-reset'
import { RESET_REFUSAL } from '@/modules/invites/invites'

const ANONYMOUS = 'anonymous'

const roleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER'])

/** 64 lower-case hex characters: the shape of a sha256 digest and nothing else. */
const tokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/, 'token hash expected')

/**
 * A one-time link, as it arrives from a URL.
 *
 * Bounded but not otherwise validated here, because a schema failure is written
 * to the audit row before `redactForAudit` could ever see a parsed value, and
 * the more specific the message the more it describes the secret.
 */
const rawTokenSchema = z.string().min(1).max(200)

/**
 * Bounded only. The real minimum is enforced in the domain module, where the
 * refusal can be a sentence, rather than by Zod, whose `too_small` message is
 * echoed back to the person WITH THE VALUE THEY TYPED by
 * `humanCommandInputError`. That would put a password on screen.
 */
const rawPasswordSchema = z.string().min(1).max(512)

function digest(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0
    ? createHash('sha256').update(value).digest('hex')
    : null
}

/**
 * What the audit row keeps for a command that was handed a link and a password.
 *
 * The link becomes its own sha256, which is exactly the value `AuthToken`
 * stores, so the row still joins to the invite it spent. The password does not
 * appear in any form: not hashed, not truncated, not its length.
 */
function redactCredential(input: unknown): unknown {
  const record = (input ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = { tokenHash: digest(record.token) }
  if (typeof record.name === 'string') out.name = record.name
  return out
}

function requireOrg(ctx: { orgId: string }): string | null {
  return ctx.orgId && ctx.orgId !== ANONYMOUS ? ctx.orgId : null
}

register({
  id: 'team.invite',
  label: 'Invite somebody to the team',
  description:
    'Invite an email address to join this organisation with a role. Creates a single-use, ' +
    'expiring link; the caller supplies only the hash of the link it minted.',
  category: 'auth',
  inputSchema: z.object({
    email: z.string().email().max(254),
    role: roleSchema,
    tokenHash: tokenHashSchema,
  }),
  outputSchema: z.object({
    inviteId: z.string(),
    email: z.string(),
    role: roleSchema,
    orgName: z.string(),
    expiresAt: z.string(),
  }),
  execute: async (input, ctx) => {
    const orgId = requireOrg(ctx)
    if (!orgId || ctx.userId === ANONYMOUS) return { ok: false, error: 'Not authenticated' }

    const result = await createInvite({
      orgId,
      actorUserId: ctx.userId,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
    })
    if (!result.ok) return { ok: false, error: result.error }

    return {
      ok: true,
      data: {
        inviteId: result.invite.inviteId,
        email: result.invite.email,
        role: result.invite.role,
        orgName: result.invite.orgName,
        expiresAt: result.invite.expiresAt.toISOString(),
      },
    }
  },
})

register({
  id: 'team.invite.revoke',
  label: 'Cancel an invite',
  description: 'Retire a pending invite so its link stops working.',
  category: 'auth',
  inputSchema: z.object({ inviteId: z.string().min(1).max(64) }),
  outputSchema: z.object({ email: z.string() }),
  execute: async (input, ctx) => {
    const orgId = requireOrg(ctx)
    if (!orgId || ctx.userId === ANONYMOUS) return { ok: false, error: 'Not authenticated' }

    const result = await revokeInvite({
      orgId,
      actorUserId: ctx.userId,
      inviteId: input.inviteId,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, data: { email: result.email } }
  },
})

register({
  id: 'team.member.setRole',
  label: 'Change what somebody can do',
  description: 'Set a team member’s role in this organisation.',
  category: 'auth',
  inputSchema: z.object({ userId: z.string().min(1).max(64), role: roleSchema }),
  outputSchema: z.object({ who: z.string(), role: roleSchema }),
  execute: async (input, ctx) => {
    const orgId = requireOrg(ctx)
    if (!orgId || ctx.userId === ANONYMOUS) return { ok: false, error: 'Not authenticated' }

    const result = await setMemberRole({
      orgId,
      actorUserId: ctx.userId,
      subjectUserId: input.userId,
      role: input.role,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, data: { who: result.who, role: result.role } }
  },
})

register({
  id: 'team.member.remove',
  label: 'Remove somebody from the team',
  description:
    'Remove a member from this organisation. Their account and any other organisations they ' +
    'belong to are untouched.',
  category: 'auth',
  inputSchema: z.object({ userId: z.string().min(1).max(64) }),
  outputSchema: z.object({ who: z.string() }),
  execute: async (input, ctx) => {
    const orgId = requireOrg(ctx)
    if (!orgId || ctx.userId === ANONYMOUS) return { ok: false, error: 'Not authenticated' }

    const result = await removeMember({
      orgId,
      actorUserId: ctx.userId,
      subjectUserId: input.userId,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, data: { who: result.who } }
  },
})

register({
  id: 'team.member.resetPassword',
  label: 'Send a team member a password link',
  description:
    'Mint a single-use password link for a member, for an owner to pass on. The caller supplies ' +
    'only the hash of the link it minted.',
  category: 'auth',
  inputSchema: z.object({
    userId: z.string().min(1).max(64),
    tokenHash: tokenHashSchema,
  }),
  outputSchema: z.object({ who: z.string(), email: z.string() }),
  execute: async (input, ctx) => {
    const orgId = requireOrg(ctx)
    if (!orgId || ctx.userId === ANONYMOUS) return { ok: false, error: 'Not authenticated' }

    const result = await sendMemberPasswordReset({
      orgId,
      actorUserId: ctx.userId,
      subjectUserId: input.userId,
      tokenHash: input.tokenHash,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, data: { who: result.who, email: result.email } }
  },
})

register({
  id: 'team.invite.accept',
  label: 'Accept an invite',
  description:
    'Redeem an invite link: create the account if the address is new, and join it to the ' +
    'inviting organisation with the role the invite carried.',
  category: 'auth',
  inputSchema: z.object({
    token: rawTokenSchema,
    password: rawPasswordSchema,
    name: z.string().trim().max(120).optional(),
  }),
  outputSchema: z.object({
    outcome: z.enum(['created', 'joined', 'already-member']),
    email: z.string(),
    orgName: z.string(),
    role: roleSchema,
    userId: z.string(),
  }),
  redactForAudit: redactCredential,
  execute: async (input) => {
    // No `ctx` check. This is the one command reached before there is a session,
    // which is the entire point of it: it is what creates the account. The org
    // it belongs to comes from the invite, and the caller passes that same org
    // as the audit context so the row lands on the right team.
    const args: { token: string; password: string; name?: string } = {
      token: input.token,
      password: input.password,
    }
    if (input.name !== undefined) args.name = input.name

    const result = await acceptInvite(args)
    if (!result.ok) return { ok: false, error: result.error }

    return {
      ok: true,
      data: {
        outcome: result.accepted.outcome,
        email: result.accepted.email,
        orgName: result.accepted.orgName,
        role: result.accepted.role,
        userId: result.accepted.userId,
      },
    }
  },
})

register({
  id: 'auth.password.reset',
  label: 'Set a new password',
  description: 'Redeem a password link and set a new password on the account it belongs to.',
  category: 'auth',
  inputSchema: z.object({
    token: rawTokenSchema,
    password: rawPasswordSchema,
  }),
  outputSchema: z.object({ email: z.string() }),
  redactForAudit: redactCredential,
  execute: async (input) => {
    const result = await completePasswordReset({ token: input.token, password: input.password })
    if (!result.ok) {
      const message = result.refusal ? RESET_REFUSAL[result.refusal] : result.error
      return { ok: false, error: message }
    }
    return { ok: true, data: { email: result.email } }
  },
})
