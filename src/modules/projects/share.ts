'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureJobNumber } from '@/modules/projects/job-number'

type ShareResult = { ok: true; token: string } | { ok: false; error: string }

/**
 * Store the copy of the proposal that this "send" is putting in front of the
 * customer.
 *
 * Through the command registry rather than straight to the store, because
 * exporting a document is a user-driven action with an `export.*` command
 * already defined for it: dispatching gets the `Export` row, the bytes and the
 * `CommandAuditLog` row from one call, and a share that quietly filed a
 * document without an audit trail would defeat the point of filing it.
 */
async function storeSentProposal(
  projectId: string,
  orgId: string,
  userId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { initCommands } = await import('@/modules/commands/init')
  const { dispatchCommand } = await import('@/modules/commands/dispatch')
  initCommands()

  const result = await dispatchCommand(
    'export.customerProposal',
    { projectId },
    { userId: userId ?? 'anonymous', orgId, projectId },
    'UI',
  )
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Create (or return the existing) public share token for a project's proposal.
 * The token is an unguessable 24-byte value; anyone holding the link can view
 * the read-only proposal at /share/<token>. Owner-scoped.
 *
 * Sending files a copy. Every call stores the proposal as it stands right now,
 * including a second call on an already-shared project, because pressing the
 * button again after editing the price is sending a different document and the
 * customer's link will start showing it. The record has to say which one they
 * were shown.
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

  // The customer's copy prints the job number, and the share page is public so
  // it cannot assign one itself. Stamped here, where there is still a session
  // behind the request, which is the moment the proposal is actually sent.
  // Before the copy is taken, so the copy has the number on it.
  await ensureJobNumber(project.id, orgId)

  // A send whose copy could not be filed is not a send. Refusing is the point:
  // handing over a link while recording nothing is exactly the state this
  // change exists to end.
  const stored = await storeSentProposal(project.id, orgId, session.user?.id ?? null)
  if (!stored.ok) return { ok: false, error: stored.error }

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
    select: { id: true, orgId: true, proposalAcceptedAt: true },
  })
  if (!project) return { ok: false, error: 'Proposal not found' }

  // What was signed has to be on file, and it has to be on file with a
  // timestamp at or before the signature: the share page serves the last copy
  // stored up to the moment of acceptance, so a copy taken afterwards would
  // never be the one shown. Projects shared before documents were stored have
  // no copy at all, and this is the last chance to take one.
  const { storedProposalForShare } = await import('@/modules/exports/document/read')
  const existing = await storedProposalForShare({
    id: project.id,
    orgId: project.orgId,
    proposalAcceptedAt: project.proposalAcceptedAt,
  })
  if (!existing) {
    const stored = await storeSentProposal(project.id, project.orgId, null)
    if (!stored.ok) return { ok: false, error: stored.error }
  }

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
