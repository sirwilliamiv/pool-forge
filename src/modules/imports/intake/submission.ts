// Landing a customer submission.
//
// One transaction produces everything the builder needs to find the lead
// waiting on their dashboard:
//
//   IntakeSubmission  the lead itself, with the contact details
//   Project (DRAFT)   so it shows up in the normal project list
//   ImportSession     the reviewable unit, queued for analysis
//   SourceImage[]     re-pointed at the new project
//
// The images are already in the blob store by this point: `ingestImage` ran
// first, because sniffing, EXIF stripping, and hashing must happen before bytes
// are durable, and because a rejected file should never create a half-formed
// lead. The transaction below only writes rows.

import type { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { emptyDesignIntent } from '@/modules/imports/intent'
import { INTAKE_ANALYSIS_STATUS } from './constants'
import type { IntakeContact } from './schema'
import type { ResolvedIntakeLink } from './links'

export interface LandSubmissionInput {
  link: ResolvedIntakeLink
  contact: IntakeContact
  /** SourceImage ids produced by `ingestImage`, already org-scoped to the link. */
  sourceImageIds: string[]
  now?: Date
}

export interface LandSubmissionResult {
  submissionId: string
  projectId: string
  importSessionId: string
  imageCount: number
}

/** Names the draft so a builder can tell two leads apart at a glance. */
export function draftProjectName(contact: IntakeContact, at: Date): string {
  const who = contact.customerName ?? contact.email ?? contact.phone
  const day = at.toISOString().slice(0, 10)
  return who === null ? `Customer intake ${day}` : `${who} (intake ${day})`
}

/**
 * The customer's own words, verbatim, into the field the builder already reads.
 * Prefixed so nobody mistakes a homeowner's wish list for a builder's note.
 */
export function intakeInternalNotes(
  contact: IntakeContact,
  link: ResolvedIntakeLink,
  at: Date,
): string {
  const lines: string[] = [`Customer intake via "${link.label}" on ${at.toISOString()}.`]
  if (contact.customerName !== null) lines.push(`Name: ${contact.customerName}`)
  if (contact.email !== null) lines.push(`Email: ${contact.email}`)
  if (contact.phone !== null) lines.push(`Phone: ${contact.phone}`)
  if (contact.notes !== null) lines.push('', 'What the customer wrote:', contact.notes)
  return lines.join('\n')
}

export async function landIntakeSubmission(
  input: LandSubmissionInput,
): Promise<LandSubmissionResult> {
  const now = input.now ?? new Date()
  const { link, contact } = input

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Re-read the images under the link's org. `ingestImage` was told the org,
    // but this is the write that binds them to a project, so it re-establishes
    // the scope from the database rather than trusting the caller's list.
    const images =
      input.sourceImageIds.length === 0
        ? []
        : await tx.sourceImage.findMany({
            where: { id: { in: input.sourceImageIds }, orgId: link.orgId },
            select: { id: true },
            orderBy: { id: 'asc' },
          })
    const imageIds = images.map((image) => image.id)

    const project = await tx.project.create({
      data: {
        orgId: link.orgId,
        name: draftProjectName(contact, now),
        status: 'DRAFT',
        internalNotes: intakeInternalNotes(contact, link, now),
      },
      select: { id: true },
    })

    if (imageIds.length > 0) {
      await tx.sourceImage.updateMany({
        where: { id: { in: imageIds }, orgId: link.orgId },
        data: { projectId: project.id, origin: 'CUSTOMER_INTAKE' },
      })
    }

    const session = await tx.importSession.create({
      data: {
        orgId: link.orgId,
        projectId: project.id,
        status: 'DRAFT',
        designIntentJson: emptyDesignIntent(imageIds) as unknown as object,
        appliedCommandIds: [],
        touchedFieldPaths: [],
        // Persisted here, inside the transaction that lands the submission and
        // strictly before any model call is attempted. A blocking Vertex call
        // yields no intermediate response, so a client polling for progress
        // would otherwise see nothing at all until the whole call returned.
        analysisStatus:
          imageIds.length > 0 ? INTAKE_ANALYSIS_STATUS.PENDING : INTAKE_ANALYSIS_STATUS.NONE,
      },
      select: { id: true },
    })

    const submission = await tx.intakeSubmission.create({
      data: {
        orgId: link.orgId,
        intakeLinkId: link.linkId,
        projectId: project.id,
        customerName: contact.customerName,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
        status: 'NEW',
      },
      select: { id: true },
    })

    return {
      submissionId: submission.id,
      projectId: project.id,
      importSessionId: session.id,
      imageCount: imageIds.length,
    }
  })
}

/**
 * Best-effort cleanup for images that were ingested but whose submission never
 * landed. Org-scoped, and it only ever touches unattached customer-intake rows,
 * so a builder's own images cannot be caught by it.
 */
export async function releaseOrphanedIntakeImages(
  orgId: string,
  sourceImageIds: string[],
): Promise<void> {
  if (sourceImageIds.length === 0) return
  await db.sourceImage.deleteMany({
    where: {
      id: { in: sourceImageIds },
      orgId,
      projectId: null,
      origin: 'CUSTOMER_INTAKE',
    },
  })
}
