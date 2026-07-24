'use server'

import { randomBytes } from 'node:crypto'
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
    select: { id: true, proposalAcceptedAt: true },
  })
  if (!project) return { ok: false, error: 'Proposal not found' }
  if (project.proposalAcceptedAt) return { ok: true }

  await db.project.update({
    where: { id: project.id },
    data: { proposalAcceptedAt: new Date(), proposalAcceptedName: acceptedName },
  })
  return { ok: true }
}
