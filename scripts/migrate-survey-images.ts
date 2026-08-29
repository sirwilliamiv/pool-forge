// One-time migration: lift survey underlay data URLs out of `Drawing.rootJson`
// and into the BlobStore as `SourceImage` rows.
//
// A single 12MP customer photo base64s to roughly 16MB inside a JSON column,
// re-read and re-written on every save and every load. After this runs, the
// drawing carries `survey.sourceImageId` and the bytes live in the blob store.
//
// Idempotent: a drawing already holding a `sourceImageId` is skipped, and the
// content-addressed store returns the existing key for identical bytes.
//
//   pnpm exec tsx scripts/migrate-survey-images.ts
//   DRY_RUN=1 pnpm exec tsx scripts/migrate-survey-images.ts

import { PrismaClient } from '@prisma/client'

import { decodeDataUrl } from '../src/modules/storage/data-url'
import { getBlobStore } from '../src/modules/storage'

const db = new PrismaClient()
const DRY_RUN = process.env.DRY_RUN === '1'

interface Stats {
  scanned: number
  migrated: number
  skipped: number
  failed: number
}

function readNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function main(): Promise<void> {
  const stats: Stats = { scanned: 0, migrated: 0, skipped: 0, failed: 0 }
  const store = getBlobStore()

  const drawings = await db.drawing.findMany({
    select: {
      id: true,
      rootJson: true,
      project: { select: { id: true, orgId: true } },
    },
    orderBy: { id: 'asc' },
  })

  for (const drawing of drawings) {
    stats.scanned += 1

    const root = drawing.rootJson
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      stats.skipped += 1
      continue
    }
    const rootObj = root as Record<string, unknown>
    const survey = rootObj.survey
    if (!survey || typeof survey !== 'object' || Array.isArray(survey)) {
      stats.skipped += 1
      continue
    }
    const surveyObj = survey as Record<string, unknown>

    const dataUrl = surveyObj.imageDataUrl
    if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
      stats.skipped += 1
      continue
    }

    const decoded = decodeDataUrl(dataUrl)
    if (!decoded) {
      console.warn(`drawing ${drawing.id}: survey.imageDataUrl is not a base64 data URL, left in place`)
      stats.failed += 1
      continue
    }

    // Org scope comes from the owning project: SourceImage is org-scoped like
    // every other row, and Drawing reaches its org only through Project.
    const orgId = drawing.project.orgId
    const projectId = drawing.project.id

    if (DRY_RUN) {
      console.log(
        `[dry-run] drawing ${drawing.id}: would migrate ${decoded.data.byteLength} bytes ` +
          `(${decoded.mimeType}) into org ${orgId}`,
      )
      stats.migrated += 1
      continue
    }

    const put = await store.put({ data: decoded.data, mimeType: decoded.mimeType })

    const existing = await db.sourceImage.findFirst({
      where: { orgId, sha256: put.sha256 },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })

    const sourceImageId =
      existing?.id ??
      (
        await db.sourceImage.create({
          data: {
            orgId,
            projectId,
            kind: 'SITE_PLAN',
            storageKey: put.storageKey,
            mimeType: put.mimeType,
            bytes: put.bytes,
            sha256: put.sha256,
            widthPx: Math.round(readNumber(surveyObj, 'imageNaturalWidthPx')),
            heightPx: Math.round(readNumber(surveyObj, 'imageNaturalHeightPx')),
            origin: 'BUILDER',
          },
          select: { id: true },
        })
      ).id

    const { imageDataUrl: _dropped, ...restOfSurvey } = surveyObj
    const nextRoot: Record<string, unknown> = {
      ...rootObj,
      survey: { ...restOfSurvey, sourceImageId },
    }

    await db.drawing.update({
      where: { id: drawing.id },
      data: { rootJson: nextRoot as unknown as object },
    })

    stats.migrated += 1
    console.log(`drawing ${drawing.id}: survey image -> SourceImage ${sourceImageId}`)
  }

  console.log(
    `survey image migration${DRY_RUN ? ' (dry run)' : ''}: ` +
      `${stats.scanned} scanned, ${stats.migrated} migrated, ` +
      `${stats.skipped} skipped, ${stats.failed} failed`,
  )
}

main()
  .catch((err: unknown) => {
    console.error('survey image migration failed', err)
    process.exitCode = 1
  })
  .finally(() => {
    void db.$disconnect()
  })
