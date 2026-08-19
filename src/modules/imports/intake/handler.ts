// The public intake handler.
//
// This is the only code path in Pool Forge an unauthenticated stranger can
// reach, so the ordering below is deliberate and each step is cheap before the
// one after it:
//
//   1. Normalize the caller to a rate-limit bucket (one trusted proxy hop,
//      IPv6 folded to /64).
//   2. Spend the IP budget. Before any database read, so token enumeration
//      costs the attacker their own budget and never touches the link index.
//   3. Resolve the token. This is the single unscoped query in the app and it
//      is what establishes the org for everything that follows.
//   4. Spend the link budget, keyed on the resolved link id.
//   5. Read the body under a hard byte ceiling, then parse it.
//   6. Hand every file to Track I1's `ingestImage`. No byte handling here.
//   7. Land the submission in one transaction.
//   8. Acknowledge immediately; analysis is claimed from the PENDING row that
//      transaction already wrote.
//
// Every refusal returns a body built by `intakeErrorBody`, and the four ways a
// link can be unusable collapse into one code, one status, and one string.

import {
  IngestRejection,
  MAX_IMAGES_PER_SESSION,
  MAX_IMAGE_BYTES,
  type IngestInput,
} from '@/modules/imports/ingest/types'
import { parseCappedFormData, readCappedBody } from './body'
import { clientIpBucket } from './client-ip'
import { INTAKE_FILE_FIELD, INTAKE_MAX_BODY_BYTES } from './constants'
import { IntakeError, logIntakeWarning, safeIntakeError, type IntakeErrorCode } from './errors'
import { ingestImage } from './ingest-seam'
import { resolveIntakeLink } from './links'
import { scheduleQueuedAnalysis } from './queue'
import { consumeIpBudget, consumeLinkBudget } from './rate-limit'
import { IntakeContactSchema, sanitizeContact, type IntakeAcknowledgement } from './schema'
import { landIntakeSubmission, releaseOrphanedIntakeImages } from './submission'

export interface IntakeHandlerOutcome {
  status: number
  body: unknown
  headers: Record<string, string>
}

const REJECTION_TO_CODE: Record<IngestRejection['code'], IntakeErrorCode> = {
  TOO_LARGE: 'too_large',
  UNSUPPORTED_TYPE: 'unsupported_type',
  CORRUPT: 'corrupt',
  TOO_MANY: 'too_many',
  EMPTY: 'empty',
}

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === 'object' && value !== null && 'arrayBuffer' in value && 'size' in value
}

/**
 * Handle one submission. Throws only `IntakeError`; callers turn that into a
 * response. Nothing thrown from here carries a filename, a path, a token, or a
 * third-party message.
 */
export async function handleIntakeSubmission(
  req: Request,
  rawToken: string,
): Promise<IntakeAcknowledgement> {
  const ipBucket = clientIpBucket(req.headers)

  const ipBudget = await consumeIpBudget(ipBucket)
  if (!ipBudget.allowed) throw new IntakeError('rate_limited')

  const link = await resolveIntakeLink(rawToken)
  // Unknown, malformed, deactivated, and expired all land here, identically.
  if (link === null) throw new IntakeError('link_unavailable')

  const linkBudget = await consumeLinkBudget(link.linkId)
  if (!linkBudget.allowed) throw new IntakeError('rate_limited')

  const buffer = await readCappedBody(req, { maxBytes: INTAKE_MAX_BODY_BYTES })
  const form = await parseCappedFormData(buffer, req.headers.get('content-type'))

  const files = form.getAll(INTAKE_FILE_FIELD).filter(isFileLike)
  if (files.length === 0) throw new IntakeError('empty')
  // Counted before a single file is read, so a 9-file post costs nothing.
  if (files.length > MAX_IMAGES_PER_SESSION) throw new IntakeError('too_many')

  const contact = sanitizeContact(
    IntakeContactSchema.parse({
      customerName: form.get('customerName'),
      email: form.get('email'),
      phone: form.get('phone'),
      notes: form.get('notes'),
    }),
  )

  const sourceImageIds: string[] = []
  try {
    for (const file of files) {
      // Declared size, checked before the part is materialised.
      if (file.size > MAX_IMAGE_BYTES) throw new IntakeError('too_large')
      if (file.size === 0) throw new IntakeError('empty')

      const bytes = Buffer.from(await file.arrayBuffer())
      // Actual size. The multipart part header is as much a claim as
      // Content-Length was.
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new IntakeError('too_large')

      const input: IngestInput = {
        bytes,
        // Advisory only. `ingestImage` sniffs magic bytes and the sniffed type
        // wins. The filename is deliberately not passed and never stored.
        declaredMimeType: typeof file.type === 'string' && file.type !== '' ? file.type : null,
        orgId: link.orgId,
        projectId: null,
        origin: 'CUSTOMER_INTAKE',
        uploadedBy: null,
      }

      // TODO(I1): `ingestImage` is Track I1's, in `src/modules/imports/ingest/`,
      // which has not merged onto this branch. It is resolved through
      // `ingest-seam.ts` until it does; swap that file to a direct re-export and
      // this call site is unchanged. Byte sniffing, EXIF/GPS stripping,
      // downscaling, hashing, dedupe, and blob writes all live behind it.
      const result = await ingestImage(input)
      sourceImageIds.push(result.sourceImageId)
    }
  } catch (err) {
    await releaseOrphanedIntakeImages(link.orgId, sourceImageIds).catch(() => undefined)
    if (err instanceof IngestRejection) {
      // IngestRejection messages are already caller-safe, but the canned intake
      // copy is used anyway so one vocabulary reaches the customer.
      throw new IntakeError(REJECTION_TO_CODE[err.code])
    }
    if (err instanceof IntakeError) throw err
    throw safeIntakeError(err, 'unavailable', { stage: 'ingest', orgId: link.orgId })
  }

  let landed
  try {
    landed = await landIntakeSubmission({ link, contact, sourceImageIds })
  } catch (err) {
    await releaseOrphanedIntakeImages(link.orgId, sourceImageIds).catch(() => undefined)
    throw safeIntakeError(err, 'unavailable', { stage: 'land', orgId: link.orgId })
  }

  logIntakeWarning('intake_submission_landed', {
    orgId: link.orgId,
    submissionId: landed.submissionId,
    images: landed.imageCount,
  })

  // Fire-and-forget. The PENDING row is already committed, so an analysis
  // outage cannot turn into a failed upload for the homeowner.
  scheduleQueuedAnalysis(landed.importSessionId)

  return {
    ok: true,
    received: landed.imageCount,
    message: 'Thanks, we have your photos. Your builder will be in touch.',
  }
}
