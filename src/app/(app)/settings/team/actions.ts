'use server'

// The team screen's four buttons.
//
// Every one of them dispatches through the command registry, so every change to
// who is on a team and what they can do leaves a `CommandAuditLog` row. That is
// the point of the rule in `CLAUDE.md`, and this is the screen it was written
// for: "who made Sam an owner" is a question that gets asked after something has
// gone wrong, and the answer has to exist before then.
//
// WHERE THE RAW LINK LIVES
//
// Two of these mint a one-time token. The token is generated HERE and only its
// sha256 is handed to the command, so the credential never enters the code path
// that writes `inputJson` and `outputJson` to a table that is kept forever. The
// raw value goes into one email and, when there is no mail provider, into one
// response for somebody to copy. It is never logged.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { hashToken, mintToken } from '@/modules/auth/tokens'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { appUrl, sendEmail } from '@/modules/email/send'

const TEAM_PATH = '/settings/team'

const NOT_SIGNED_IN = 'Your session has expired. Sign in again.'

const roleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER'])

export type TeamActionResult =
  | { ok: true; message: string; link?: string; delivered?: boolean }
  | { ok: false; error: string }

interface Actor {
  userId: string
  orgId: string
}

async function actor(): Promise<Actor | null> {
  const session = await auth()
  const userId = session?.user?.id
  const orgId = session?.user?.orgId
  if (!userId || !orgId) return null
  return { userId, orgId }
}

const inviteSchema = z.object({
  email: z.string().trim().min(1).max(254).email('Enter a valid email address.'),
  role: roleSchema,
})

interface InviteData {
  inviteId: string
  email: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  orgName: string
  expiresAt: string
}

/**
 * Invite somebody.
 *
 * When there is no mail provider configured the invite still succeeds and the
 * link comes back for the inviter to copy. That is not a fallback, it is the
 * main path during this beta: there is no mail account yet and invites are the
 * only way anybody gets in. What it must never do is claim an email was sent
 * when none was, which is exactly what `sendEmail` refuses to pretend.
 */
export async function inviteMemberAction(formData: FormData): Promise<TeamActionResult> {
  const who = await actor()
  if (!who) return { ok: false, error: NOT_SIGNED_IN }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email') ?? '',
    role: formData.get('role') ?? 'MEMBER',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the address and try again.' }
  }

  const token = mintToken()
  const result = await dispatchCommand<InviteData>(
    'team.invite',
    { email: parsed.data.email, role: parsed.data.role, tokenHash: hashToken(token) },
    { userId: who.userId, orgId: who.orgId },
  )
  if (!result.ok) return { ok: false, error: result.error }

  const link = appUrl(`/invite/${token}`)
  const sent = await sendEmail({
    to: result.data.email,
    subject: `You have been invited to ${result.data.orgName} on Pool Forge`,
    body: [
      `You have been invited to join ${result.data.orgName} on Pool Forge.`,
      '',
      link,
      '',
      'The link works once and expires in a week.',
    ].join('\n'),
  })

  revalidatePath(TEAM_PATH)

  if (sent.delivered) {
    return { ok: true, message: `Invite emailed to ${result.data.email}.`, delivered: true }
  }
  return {
    ok: true,
    message: `Invite created for ${result.data.email}. No email was sent, so send them this link.`,
    link,
    delivered: false,
  }
}

export async function revokeInviteAction(inviteId: string): Promise<TeamActionResult> {
  const who = await actor()
  if (!who) return { ok: false, error: NOT_SIGNED_IN }

  const result = await dispatchCommand<{ email: string }>(
    'team.invite.revoke',
    { inviteId },
    { userId: who.userId, orgId: who.orgId },
  )
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(TEAM_PATH)
  return { ok: true, message: `The invite to ${result.data.email} no longer works.` }
}

export async function setMemberRoleAction(
  userId: string,
  role: string,
): Promise<TeamActionResult> {
  const who = await actor()
  if (!who) return { ok: false, error: NOT_SIGNED_IN }

  const parsed = roleSchema.safeParse(role)
  if (!parsed.success) return { ok: false, error: 'That is not a role.' }

  const result = await dispatchCommand<{ who: string; role: string }>(
    'team.member.setRole',
    { userId, role: parsed.data },
    { userId: who.userId, orgId: who.orgId },
  )
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(TEAM_PATH)
  return { ok: true, message: `${result.data.who} is now ${describeRole(result.data.role)}.` }
}

export async function removeMemberAction(userId: string): Promise<TeamActionResult> {
  const who = await actor()
  if (!who) return { ok: false, error: NOT_SIGNED_IN }

  const result = await dispatchCommand<{ who: string }>(
    'team.member.remove',
    { userId },
    { userId: who.userId, orgId: who.orgId },
  )
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(TEAM_PATH)
  return { ok: true, message: `${result.data.who} has been removed from the team.` }
}

/**
 * Mint a password link for a team member.
 *
 * The link comes back rather than being emailed, because the case this exists
 * for is a builder on the phone who cannot find the message. It is a real
 * privilege (whoever holds this link is that person until it is used), which is
 * why the command refuses an admin pointing it at an owner.
 */
export async function resetMemberPasswordAction(userId: string): Promise<TeamActionResult> {
  const who = await actor()
  if (!who) return { ok: false, error: NOT_SIGNED_IN }

  const token = mintToken()
  const result = await dispatchCommand<{ who: string; email: string }>(
    'team.member.resetPassword',
    { userId, tokenHash: hashToken(token) },
    { userId: who.userId, orgId: who.orgId },
  )
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath(TEAM_PATH)
  return {
    ok: true,
    message: `Password link for ${result.data.who}. It works once and expires in an hour.`,
    link: appUrl(`/reset-password/${token}`),
    delivered: false,
  }
}

function describeRole(role: string): string {
  if (role === 'OWNER') return 'an owner'
  if (role === 'ADMIN') return 'an admin'
  return 'a member'
}
