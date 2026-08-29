// Intake link lifecycle: minting, org-scoped management, and the one lookup in
// the whole application that is allowed to run without an `orgId` filter.

import { randomBytes, timingSafeEqual } from 'node:crypto'

import { db } from '@/lib/db'
import { INTAKE_MAX_LABEL_CHARS, INTAKE_TOKEN_BYTES } from './constants'

/** 24 random bytes, base64url. Same entropy as the proposal share token. */
export function mintIntakeToken(): string {
  return randomBytes(INTAKE_TOKEN_BYTES).toString('base64url')
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

/**
 * Cheap shape check before the token reaches the database. Rejecting garbage
 * here keeps obviously-bogus input from generating index probes, but note that
 * a rejection must produce the same caller-visible response as a well-formed
 * token that does not exist. Callers rely on that.
 */
export function isPlausibleIntakeToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

export interface ResolvedIntakeLink {
  linkId: string
  orgId: string
  orgName: string
  label: string
}

/**
 * Resolve a token to a live link.
 *
 * This is the sole exception to the org-scoping rule: it is the lookup that
 * *establishes* the org for an otherwise anonymous request. Everything the
 * caller does afterwards is scoped to the `orgId` returned here.
 *
 * Returns null for every failure mode: unknown token, malformed token,
 * deactivated link, expired link. The caller must not branch on the reason,
 * and there is deliberately no way for it to: one null, no discriminant.
 */
export async function resolveIntakeLink(
  rawToken: string,
  now: Date = new Date(),
): Promise<ResolvedIntakeLink | null> {
  const token = rawToken.trim()
  if (!isPlausibleIntakeToken(token)) return null

  const link = await db.intakeLink.findUnique({
    where: { token },
    select: {
      id: true,
      orgId: true,
      label: true,
      active: true,
      expiresAt: true,
      token: true,
      org: { select: { id: true, name: true } },
    },
  })
  if (!link) return null

  // Constant-time compare of the stored token against the supplied one. The
  // unique index already matched, so this changes no outcome; it keeps the
  // comparison from becoming a length-dependent early-exit if this function is
  // ever refactored to a non-unique lookup.
  if (!constantTimeEquals(link.token, token)) return null

  if (!link.active) return null
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) return null

  return {
    linkId: link.id,
    orgId: link.orgId,
    orgName: link.org.name,
    label: link.label,
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, INTAKE_MAX_LABEL_CHARS)
}

export interface IntakeLinkSummary {
  id: string
  token: string
  label: string
  active: boolean
  expiresAt: Date | null
  createdAt: Date
  submissionCount: number
}

/**
 * Every intake link an org owns, newest first, with its submission count.
 *
 * Org-scoped, and there is no unscoped variant anywhere in this module. No
 * fixture or sentinel intake link is ever seeded (`prisma/seed.ts` creates
 * none), so this list needs no test-data filter clause; if one is ever added,
 * the filter belongs here and in `listIntakeSubmissions` in the same commit.
 */
export async function listIntakeLinks(orgId: string): Promise<IntakeLinkSummary[]> {
  const rows = await db.intakeLink.findMany({
    where: { orgId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      token: true,
      label: true,
      active: true,
      expiresAt: true,
      createdAt: true,
      _count: { select: { submissions: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    label: row.label,
    active: row.active,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    submissionCount: row._count.submissions,
  }))
}

export interface IntakeSubmissionSummary {
  id: string
  customerName: string | null
  email: string | null
  phone: string | null
  status: string
  createdAt: Date
  projectId: string | null
  projectName: string | null
  linkLabel: string
  imageCount: number
}

/** Recent submissions for an org, newest first. Org-scoped. */
export async function listIntakeSubmissions(
  orgId: string,
  take = 25,
): Promise<IntakeSubmissionSummary[]> {
  const rows = await db.intakeSubmission.findMany({
    where: { orgId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      customerName: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      projectId: true,
      project: { select: { name: true } },
      intakeLink: { select: { label: true } },
    },
  })

  const projectIds = rows.map((r) => r.projectId).filter((id): id is string => id !== null)
  const counts =
    projectIds.length === 0
      ? []
      : await db.sourceImage.groupBy({
          by: ['projectId'],
          where: { orgId, projectId: { in: projectIds } },
          _count: { _all: true },
        })
  const countByProject = new Map<string, number>()
  for (const row of counts) {
    if (row.projectId !== null) countByProject.set(row.projectId, row._count._all)
  }

  return rows.map((row) => ({
    id: row.id,
    customerName: row.customerName,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    linkLabel: row.intakeLink.label,
    imageCount: row.projectId === null ? 0 : (countByProject.get(row.projectId) ?? 0),
  }))
}
