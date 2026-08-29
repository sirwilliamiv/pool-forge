// Reading a stored document back.
//
// Two rules hold everywhere in this file.
//
// Every query is filtered by org. `Export` has no `orgId` of its own, so the
// filter goes through the relation (`project: { orgId }`) rather than being
// left off because the id "came from somewhere trusted". A row id is an
// address, never a capability.
//
// Every read is verified against `contentHash` before the bytes are handed
// back. The point of storing the document is to be able to say "this is what we
// sent"; bytes that no longer hash to what the row recorded cannot carry that
// claim, so they are refused rather than shown.

import { ExportKind } from '@prisma/client'

import { db } from '@/lib/db'
import { BlobNotFoundError, InvalidStorageKeyError, getBlobStore } from '@/modules/storage'

import { exportFailure } from './errors'
import { extractDocumentParts, hashDocument, type DocumentParts } from './html'
import { isDocumentKind, type DocumentKind } from './kinds'

export interface StoredExportRef {
  id: string
  kind: DocumentKind
  url: string | null
  generatedAt: Date
  storageKey: string
  contentHash: string
  byteSize: number
  generatedById: string | null
  projectId: string
  jobNumber: number | null
}

const ROW_SELECT = {
  id: true,
  kind: true,
  url: true,
  generatedAt: true,
  storageKey: true,
  contentHash: true,
  byteSize: true,
  generatedById: true,
  projectId: true,
  project: { select: { jobNumber: true } },
} as const

type Row = {
  id: string
  kind: ExportKind
  url: string | null
  generatedAt: Date
  storageKey: string | null
  contentHash: string | null
  byteSize: number | null
  generatedById: string | null
  projectId: string
  project: { jobNumber: number | null }
}

/**
 * A row is only a stored document once all three columns are present. Rows
 * written before documents were stored have `url` and nothing else, and they
 * are history rather than evidence.
 */
function toRef(row: Row): StoredExportRef | null {
  if (!row.storageKey || !row.contentHash || row.byteSize === null) return null
  if (!isDocumentKind(row.kind)) return null
  return {
    id: row.id,
    kind: row.kind,
    url: row.url,
    generatedAt: row.generatedAt,
    storageKey: row.storageKey,
    contentHash: row.contentHash,
    byteSize: row.byteSize,
    generatedById: row.generatedById,
    projectId: row.projectId,
    jobNumber: row.project.jobNumber,
  }
}

/** Only rows that actually carry bytes. */
const HAS_BYTES = {
  storageKey: { not: null },
  contentHash: { not: null },
  byteSize: { not: null },
} as const

/**
 * The most recent stored document of a kind, optionally as of a moment.
 *
 * `notAfter` is what freezes an accepted proposal: pass the acceptance time and
 * a document stored afterwards cannot become the copy the customer signed.
 */
export async function latestStoredExport(args: {
  projectId: string
  orgId: string
  kind: DocumentKind
  notAfter?: Date | undefined
}): Promise<StoredExportRef | null> {
  const row = await db.export.findFirst({
    where: {
      projectId: args.projectId,
      project: { orgId: args.orgId },
      kind: args.kind,
      ...HAS_BYTES,
      ...(args.notAfter ? { generatedAt: { lte: args.notAfter } } : {}),
    },
    // `generatedAt` alone is not a total order: two documents stored in the
    // same millisecond would come back in whichever order the planner felt
    // like. The id breaks the tie so the answer is stable.
    orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
    select: ROW_SELECT,
  })
  return row ? toRef(row) : null
}

/** One stored document by id, org-scoped. */
export async function storedExportById(
  exportId: string,
  orgId: string,
): Promise<StoredExportRef | null> {
  const row = await db.export.findFirst({
    where: { id: exportId, project: { orgId }, ...HAS_BYTES },
    select: ROW_SELECT,
  })
  return row ? toRef(row) : null
}

/** Every stored document for a project, newest first. The "what did we send" list. */
export async function listStoredExports(
  projectId: string,
  orgId: string,
): Promise<StoredExportRef[]> {
  const rows = await db.export.findMany({
    where: { projectId, project: { orgId }, ...HAS_BYTES },
    orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
    select: ROW_SELECT,
  })
  const out: StoredExportRef[] = []
  for (const row of rows) {
    const ref = toRef(row)
    if (ref) out.push(ref)
  }
  return out
}

export type ReadResult =
  | { ok: true; bytes: Buffer; html: string }
  | { ok: false; error: string }

const MISSING = 'The stored copy of this document could not be read.'
const CORRUPT = 'The stored copy of this document did not match its recorded fingerprint.'

/** The bytes, checked against the fingerprint the row recorded when it was stored. */
export async function readStoredExport(ref: StoredExportRef): Promise<ReadResult> {
  let bytes: Buffer
  try {
    bytes = await getBlobStore().get(ref.storageKey)
  } catch (err) {
    if (err instanceof BlobNotFoundError || err instanceof InvalidStorageKeyError) {
      return { ok: false, error: exportFailure('read', err, MISSING).message }
    }
    return { ok: false, error: exportFailure('read', err, MISSING).message }
  }

  if (hashDocument(bytes) !== ref.contentHash) {
    return {
      ok: false,
      error: exportFailure(
        'verify',
        new Error(`content hash mismatch for export ${ref.id}`),
        CORRUPT,
      ).message,
    }
  }

  return { ok: true, bytes, html: bytes.toString('utf8') }
}

/** The stored document, split into the pieces a page can render inline. */
export async function readStoredExportParts(
  ref: StoredExportRef,
): Promise<DocumentParts | null> {
  const read = await readStoredExport(ref)
  if (!read.ok) return null
  const parts = extractDocumentParts(read.html)
  if (!parts) {
    exportFailure(
      'parse',
      new Error(`stored export ${ref.id} is not a document this renderer wrote`),
      MISSING,
    )
    return null
  }
  return parts
}

/**
 * The copy the customer is entitled to see.
 *
 * Before acceptance: the most recent copy stored, which is the one the last
 * "send" put in front of them. After acceptance: the most recent copy stored at
 * or before the moment they signed, so re-pricing the project afterwards cannot
 * rewrite the document that was signed.
 */
export async function storedProposalForShare(project: {
  id: string
  orgId: string
  proposalAcceptedAt: Date | null
}): Promise<StoredExportRef | null> {
  const args: Parameters<typeof latestStoredExport>[0] = {
    projectId: project.id,
    orgId: project.orgId,
    kind: ExportKind.CUSTOMER_PROPOSAL,
  }
  if (project.proposalAcceptedAt) args.notAfter = project.proposalAcceptedAt
  return latestStoredExport(args)
}
