// Write a document to the blob store and record it against the project.
//
// Bytes never go in Postgres. `getBlobStore()` is the same store the image
// ingestion pipeline writes to: content-addressed, sharded, driver-swappable,
// and the `storageKey` on the `Export` row is an address rather than a
// capability. Reads resolve the row first and the bytes second, always.

import { db } from '@/lib/db'
import { getBlobStore } from '@/modules/storage'

import { exportFailure } from './errors'
import type { DocumentKind, DocumentOptions } from './kinds'
import { renderExportDocument } from './render'

export interface StoredExportDocument {
  exportId: string
  kind: DocumentKind
  url: string
  storageKey: string
  contentHash: string
  byteSize: number
  generatedAt: string
}

export type StoreResult =
  | { ok: true; data: StoredExportDocument }
  | { ok: false; error: string }

const RENDER_FAILED =
  'Pool Forge could not produce a copy of that document, so nothing was sent or recorded.'
const WRITE_FAILED =
  'Pool Forge produced the document but could not file the copy, so nothing was recorded.'

/**
 * Render, store, record. All three or none: an `Export` row without bytes is a
 * ledger entry claiming a document exists that does not, which is worse than no
 * entry at all.
 */
export async function storeExportDocument(args: {
  projectId: string
  orgId: string
  kind: DocumentKind
  /** The route this document is served from, kept on the row as it always was. */
  url: string
  generatedById: string | null
  options: DocumentOptions
}): Promise<StoreResult> {
  let rendered
  try {
    rendered = await renderExportDocument({
      kind: args.kind,
      projectId: args.projectId,
      orgId: args.orgId,
      options: args.options,
    })
  } catch (err) {
    return { ok: false, error: exportFailure('render', err, RENDER_FAILED).message }
  }
  // Null is not a failure to report as one: it means the project is not this
  // organisation's, which every caller turns into the same sentence.
  if (!rendered) return { ok: false, error: 'Project not found' }

  try {
    const put = await getBlobStore().put({
      data: rendered.bytes,
      mimeType: rendered.mimeType,
    })

    const row = await db.export.create({
      data: {
        projectId: args.projectId,
        kind: args.kind,
        url: args.url,
        generatedById: args.generatedById,
        storageKey: put.storageKey,
        contentHash: rendered.contentHash,
        byteSize: rendered.byteSize,
      },
      select: { id: true, generatedAt: true },
    })

    return {
      ok: true,
      data: {
        exportId: row.id,
        kind: args.kind,
        url: args.url,
        storageKey: put.storageKey,
        contentHash: rendered.contentHash,
        byteSize: rendered.byteSize,
        generatedAt: row.generatedAt.toISOString(),
      },
    }
  } catch (err) {
    return { ok: false, error: exportFailure('store', err, WRITE_FAILED).message }
  }
}
