// Integration test: hits the real local Postgres (`pnpm db:up`) and a real
// blob store on a temporary directory. Prisma is not mocked, per repo
// convention.
//
// The defect: "export" was `window.print()`. Nothing was stored, so there was
// no record of what was sent, to whom, or when, and the customer's own copy at
// `/share/<token>` re-rendered from today's data every time it was opened. A
// proposal somebody had signed could change its own total afterwards, silently,
// by nothing more than the builder editing a price.
//
// These tests pin the two claims that make the fix worth anything: the bytes
// that were stored come back byte for byte and hash to what the row recorded,
// and a stored copy does not move when the project underneath it does.

import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ExportKind, PriceCategory, UnitType } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { extractDocumentParts, hashDocument } from '@/modules/exports/document/html'
import {
  latestStoredExport,
  listStoredExports,
  readStoredExport,
  storedExportById,
  storedProposalForShare,
} from '@/modules/exports/document/read'
import { renderExportDocument } from '@/modules/exports/document/render'
import { storeExportDocument } from '@/modules/exports/document/store'
import { resetBlobStore } from '@/modules/storage'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn(
    'export document integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.',
  )
}

let blobRoot = ''
let orgA = ''
let orgB = ''
let projectId = ''
let lineItemId = ''

async function storeProposal(orgId = orgA) {
  return storeExportDocument({
    projectId,
    orgId,
    kind: ExportKind.CUSTOMER_PROPOSAL,
    url: `/projects/${projectId}/proposal`,
    generatedById: null,
    options: {},
  })
}

async function setUnitPrice(price: string): Promise<void> {
  await db.projectLineItem.update({ where: { id: lineItemId }, data: { unitPrice: price } })
}

async function renderNow(): Promise<string> {
  const rendered = await renderExportDocument({
    kind: ExportKind.CUSTOMER_PROPOSAL,
    projectId,
    orgId: orgA,
    options: {},
  })
  if (!rendered) throw new Error('render returned null for a project that exists')
  return rendered.html
}

beforeAll(async () => {
  if (!reachable) return
  blobRoot = await mkdtemp(join(tmpdir(), 'poolforge-exports-'))
  process.env.BLOB_STORE_LOCAL_DIR = blobRoot
  resetBlobStore()

  orgA = (await db.organization.create({ data: { name: `Export A ${RUN}`, taxRatePct: 0 } })).id
  orgB = (await db.organization.create({ data: { name: `Export B ${RUN}`, taxRatePct: 0 } })).id

  const customer = await db.customer.create({
    data: { orgId: orgA, name: `Dana Alvarez ${RUN}` },
  })
  const project = await db.project.create({
    data: {
      orgId: orgA,
      name: `Alvarez ${RUN}`,
      jobNumber: 4242,
      customerId: customer.id,
    },
  })
  projectId = project.id

  // One hand-entered amount is enough to make the quote priced, so the document
  // has a number on it that a test can watch not change.
  const line = await db.projectLineItem.create({
    data: {
      projectId: project.id,
      orgId: orgA,
      category: PriceCategory.MISC,
      name: 'Permit allowance',
      unitType: UnitType.EACH,
      quantity: '1',
      unitPrice: '1234',
    },
  })
  lineItemId = line.id
})

afterAll(async () => {
  if (!reachable) return
  await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
  await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
  delete process.env.BLOB_STORE_LOCAL_DIR
  resetBlobStore()
  if (blobRoot) await rm(blobRoot, { recursive: true, force: true })
})

describe.skipIf(!reachable)('storing a rendered document', () => {
  it('writes the bytes to the blob store and records key, hash and length on the row', async () => {
    const result = await storeProposal()
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok) return

    expect(result.data.storageKey).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}$/)
    expect(result.data.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.data.byteSize).toBeGreaterThan(1000)

    const row = await db.export.findUniqueOrThrow({ where: { id: result.data.exportId } })
    expect(row.storageKey).toBe(result.data.storageKey)
    expect(row.contentHash).toBe(result.data.contentHash)
    expect(row.byteSize).toBe(result.data.byteSize)
    expect(row.kind).toBe(ExportKind.CUSTOMER_PROPOSAL)

    // Nothing binary went into Postgres: the row addresses an object, and the
    // object is on disk.
    const onDisk = await readFile(join(blobRoot, result.data.storageKey))
    expect(onDisk.byteLength).toBe(result.data.byteSize)
  })

  it('round-trips byte for byte, and the bytes hash to what the row recorded', async () => {
    const result = await storeProposal()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const ref = await storedExportById(result.data.exportId, orgA)
    expect(ref).not.toBeNull()
    if (!ref) return

    const read = await readStoredExport(ref)
    expect(read.ok, read.ok ? '' : read.error).toBe(true)
    if (!read.ok) return

    const onDisk = await readFile(join(blobRoot, ref.storageKey))
    expect(read.bytes.equals(onDisk)).toBe(true)
    expect(read.bytes.byteLength).toBe(ref.byteSize)
    expect(hashDocument(read.bytes)).toBe(ref.contentHash)
  })

  it('stores a standalone file: no stylesheet link, no script, no remote asset', async () => {
    const result = await storeProposal()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ref = await storedExportById(result.data.exportId, orgA)
    const read = ref ? await readStoredExport(ref) : null
    expect(read?.ok).toBe(true)
    if (!read?.ok) return

    expect(read.html).not.toMatch(/<link\b/i)
    expect(read.html).not.toMatch(/<script\b/i)
    // Nothing the file would go and fetch when it is opened. The one remote URL
    // it does contain is the SVG namespace, which is an identifier rather than
    // an address and is never requested.
    expect(read.html).not.toMatch(/(?:src|href)="https?:/i)
    expect(read.html).not.toMatch(/url\(\s*['"]?https?:/i)
    expect(read.html).not.toMatch(/@import/i)

    // And it carries the styling, resolved, rather than a reference to the
    // app's design tokens.
    const parts = extractDocumentParts(read.html)
    expect(parts).not.toBeNull()
    expect(parts?.css).toContain('.proposal-page')
    expect(parts?.css).toContain('@page')
    expect(parts?.css).not.toContain('var(--pf-')
    expect(parts?.markup).toContain('Pool Construction Proposal')
  })

  it('refuses a project that is not this organisation’s', async () => {
    const result = await storeProposal(orgB)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Project not found')
  })
})

describe.skipIf(!reachable)('a stored copy does not move when the project does', () => {
  it('keeps the price that was sent after the price is changed', async () => {
    await setUnitPrice('1234')
    const stored = await storeProposal()
    expect(stored.ok).toBe(true)
    if (!stored.ok) return

    const ref = await storedExportById(stored.data.exportId, orgA)
    const before = ref ? await readStoredExport(ref) : null
    expect(before?.ok).toBe(true)
    if (!before?.ok || !ref) return
    expect(before.html).toContain('1,234')

    // The thing that used to rewrite a signed proposal.
    await setUnitPrice('9876')

    const live = await renderNow()
    expect(live).toContain('9,876')
    expect(live).not.toContain('1,234')

    const after = await readStoredExport(ref)
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.bytes.equals(before.bytes)).toBe(true)
    expect(after.html).toContain('1,234')
    expect(after.html).not.toContain('9,876')
    expect(hashDocument(after.bytes)).toBe(ref.contentHash)

    await setUnitPrice('1234')
  })

  it('serves the copy stored at or before acceptance, never one taken afterwards', async () => {
    const project = await db.project.create({
      data: { orgId: orgA, name: `Accepted ${RUN} ${randomUUID().slice(0, 6)}`, jobNumber: 4243 },
    })
    await db.projectLineItem.create({
      data: {
        projectId: project.id,
        orgId: orgA,
        category: PriceCategory.MISC,
        name: 'Permit allowance',
        unitType: UnitType.EACH,
        quantity: '1',
        unitPrice: '1000',
      },
    })

    const signedCopy = await storeExportDocument({
      projectId: project.id,
      orgId: orgA,
      kind: ExportKind.CUSTOMER_PROPOSAL,
      url: `/projects/${project.id}/proposal`,
      generatedById: null,
      options: {},
    })
    expect(signedCopy.ok).toBe(true)
    if (!signedCopy.ok) return

    const acceptedAt = new Date(Date.now() + 1000)
    await db.project.update({
      where: { id: project.id },
      data: { proposalAcceptedAt: acceptedAt, proposalAcceptedName: 'Dana Alvarez' },
    })

    // A copy taken after the signature. In the real app this is the builder
    // pressing Share again on a project that has already been signed.
    const laterCopy = await db.export.create({
      data: {
        projectId: project.id,
        kind: ExportKind.CUSTOMER_PROPOSAL,
        url: `/projects/${project.id}/proposal`,
        generatedAt: new Date(acceptedAt.getTime() + 60_000),
        storageKey: signedCopy.data.storageKey,
        contentHash: signedCopy.data.contentHash,
        byteSize: signedCopy.data.byteSize,
      },
      select: { id: true },
    })

    const served = await storedProposalForShare({
      id: project.id,
      orgId: orgA,
      proposalAcceptedAt: acceptedAt,
    })
    expect(served?.id).toBe(signedCopy.data.exportId)
    expect(served?.id).not.toBe(laterCopy.id)

    // Before acceptance the newest copy is the right answer: pressing Share
    // again is sending a different document.
    const unaccepted = await storedProposalForShare({
      id: project.id,
      orgId: orgA,
      proposalAcceptedAt: null,
    })
    expect(unaccepted?.id).toBe(laterCopy.id)
  })
})

describe.skipIf(!reachable)('reading a stored document', () => {
  it('is org-scoped: an id is an address, not a capability', async () => {
    const stored = await storeProposal()
    expect(stored.ok).toBe(true)
    if (!stored.ok) return

    expect(await storedExportById(stored.data.exportId, orgA)).not.toBeNull()
    expect(await storedExportById(stored.data.exportId, orgB)).toBeNull()
    expect(
      await latestStoredExport({ projectId, orgId: orgB, kind: ExportKind.CUSTOMER_PROPOSAL }),
    ).toBeNull()
    expect(await listStoredExports(projectId, orgB)).toEqual([])
    expect((await listStoredExports(projectId, orgA)).length).toBeGreaterThan(0)
  })

  it('ignores rows written before documents were stored', async () => {
    const project = await db.project.create({
      data: { orgId: orgA, name: `Legacy ${RUN} ${randomUUID().slice(0, 6)}` },
    })
    await db.export.create({
      data: {
        projectId: project.id,
        kind: ExportKind.CUSTOMER_PROPOSAL,
        url: `/projects/${project.id}/proposal`,
      },
    })
    expect(
      await latestStoredExport({
        projectId: project.id,
        orgId: orgA,
        kind: ExportKind.CUSTOMER_PROPOSAL,
      }),
    ).toBeNull()
    expect(await listStoredExports(project.id, orgA)).toEqual([])
  })

  it('refuses bytes that no longer match the recorded fingerprint', async () => {
    const stored = await storeProposal()
    expect(stored.ok).toBe(true)
    if (!stored.ok) return
    const ref = await storedExportById(stored.data.exportId, orgA)
    expect(ref).not.toBeNull()
    if (!ref) return

    await writeFile(join(blobRoot, ref.storageKey), 'not the document that was sent')
    const read = await readStoredExport(ref)
    expect(read.ok).toBe(false)
    if (read.ok) return
    // A sentence with a reference, never the underlying detail.
    expect(read.error).toContain('did not match its recorded fingerprint')
    expect(read.error).toMatch(/reference err_[0-9a-f]{12}/)
    expect(read.error).not.toContain(blobRoot)
    expect(read.error).not.toContain(ref.storageKey)
  })
})

describe.skipIf(!reachable)('rendering the other three documents', () => {
  it('produces a standalone file for every kind this app exports', async () => {
    for (const kind of [
      ExportKind.CONSTRUCTION_PACKET,
      ExportKind.SITE_PLAN,
      ExportKind.SCREEN_ENCLOSURE_QUOTE,
    ] as const) {
      const stored = await storeExportDocument({
        projectId,
        orgId: orgA,
        kind,
        url: `/projects/${projectId}/x`,
        generatedById: null,
        options: { pageSize: 'tabloid', showInternalPricing: false, showScreenScopeRetail: false },
      })
      expect(stored.ok, `${kind}: ${stored.ok ? '' : stored.error}`).toBe(true)
      if (!stored.ok) continue

      const ref = await storedExportById(stored.data.exportId, orgA)
      const read = ref ? await readStoredExport(ref) : null
      expect(read?.ok, `${kind} did not read back`).toBe(true)
      if (!read?.ok) continue
      const parts = extractDocumentParts(read.html)
      expect(parts, `${kind} did not round-trip`).not.toBeNull()
      expect(parts?.css.length ?? 0).toBeGreaterThan(500)
      expect(parts?.markup.length ?? 0).toBeGreaterThan(500)
    }
  })
})
