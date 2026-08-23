'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type ShareResult = { ok: true; token: string } | { ok: false; error: string }

/**
 * Create (or return the existing) public share token for a project's proposal.
 * The token is an unguessable 24-byte value; anyone holding the link can view
 * the read-only proposal at /share/<token>. Owner-scoped.
 */
export async function shareProject(projectId: string): Promise<ShareResult> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!session || !orgId) return { ok: false, error: 'Not authenticated' }

  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    select: { id: true, shareToken: true },
  })
  if (!project) return { ok: false, error: 'Project not found' }

  let token = project.shareToken
  if (!token) {
    token = randomBytes(24).toString('base64url')
    await db.project.update({
      where: { id: projectId },
      data: { shareToken: token, sharedAt: new Date() },
    })
  }
  return { ok: true, token }
}

/** Revoke a project's share link. Owner-scoped. */
export async function unshareProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!session || !orgId) return { ok: false, error: 'Not authenticated' }

  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    select: { id: true },
  })
  if (!project) return { ok: false, error: 'Project not found' }

  await db.project.update({
    where: { id: projectId },
    data: { shareToken: null, sharedAt: null },
  })
  return { ok: true }
}

/**
 * Public: record customer acceptance of a shared proposal. No auth — the
 * unguessable token is the capability. Idempotent once accepted.
 *
 * Two things this function is careful about.
 *
 * The org is derived from the project the share token resolved to, never from
 * anything the caller sent. There is no `orgId` or `projectId` parameter to
 * forge: the only input from the wire is the token, and the token is looked up
 * on a unique column. That is what makes it safe to run an org-scoped command
 * with no session behind it.
 *
 * The write goes through the command registry rather than straight to Prisma,
 * because acceptance is a user-driven state change like any other: it belongs
 * in `CommandAuditLog` beside the status changes a builder makes by hand.
 * Signing used to write two columns and move nothing, so a signed proposal sat
 * at Draft and the builder found out by chance.
 */
export async function acceptProposal(
  token: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const t = String(token || '').trim()
  const acceptedName = String(name || '').trim().slice(0, 120)
  if (!t) return { ok: false, error: 'Invalid link' }
  if (!acceptedName) return { ok: false, error: 'Please enter your name to accept' }

  const project = await db.project.findUnique({
    where: { shareToken: t },
    select: { id: true, orgId: true },
  })
  if (!project) return { ok: false, error: 'Proposal not found' }

  const { initCommands } = await import('@/modules/commands/init')
  const { dispatchCommand } = await import('@/modules/commands/dispatch')
  initCommands()

  const result = await dispatchCommand<{ status: string }>(
    'project.proposal.accept',
    { projectId: project.id, acceptedName },
    // No user: the signer is a customer, not a member of the org. The audit
    // row stores a null userId and the org taken off the project.
    { userId: 'anonymous', orgId: project.orgId, projectId: project.id },
    'API',
  )
  if (!result.ok) return { ok: false, error: result.error }

  // The builder's own views are cached, and a status that only moves after the
  // next hard reload is a status the builder does not see move.
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${project.id}`)

  return { ok: true }
}
