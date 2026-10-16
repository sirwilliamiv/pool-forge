// `vss2raw` text in, candidates and skips out. Pure: no DB, no process, no clock.
//
// parse -> flatten -> union -> normalize -> classify -> thumbnail, per master.

import { classifyMaster } from './classify'
import { flattenMaster } from './flatten'
import { outlineOf } from './outline'
import { parseRaw } from './raw-parser'
import { normalizeRings } from './scale'
import { thumbnailSvg } from './thumbnail'
import { ShapeKind } from '@prisma/client'

import {
  DETAIL_MAX_REAL_IN,
  SkipReason,
  StoredCandidateSchema,
  VISIO_SCALE_DEFAULT,
  type ConversionResult,
  type PlaceableShapeKind,
  type RawMaster,
  type Skipped,
  type StoredCandidate,
} from './types'

/** Kinds that take their size from the bounding box and price by area. */
const SIZED_KINDS: ReadonlySet<PlaceableShapeKind> = new Set([
  ShapeKind.CONCRETE_DECK,
  ShapeKind.PAVER_DECK,
  ShapeKind.GRASS_AREA,
  ShapeKind.SPA,
])

/** A deck or spa smaller than `DETAIL_MAX_REAL_IN` on both sides is a detail outline. */
export function detailOrKind(shapeKind: PlaceableShapeKind, drawingWidthIn: number, drawingHeightIn: number): PlaceableShapeKind {
  if (!SIZED_KINDS.has(shapeKind)) return shapeKind
  const longest = Math.max(drawingWidthIn, drawingHeightIn) * VISIO_SCALE_DEFAULT
  return longest < DETAIL_MAX_REAL_IN ? ShapeKind.SKETCH_PATH : shapeKind
}

export interface PreviewOptions {
  /** The uploaded file's name, used to bias classification (a master called `Roman` in `Spa.vss` is a spa). */
  fileName: string
}

function skipReasonFor(master: RawMaster): SkipReason | null {
  if (master.paths.length > 0) return null
  if (master.graphicObjects > 0) return SkipReason.RASTER
  if (master.textObjects > 0) return SkipReason.TEXT_ONLY
  return null
}

export function previewFromRaw(raw: string, opts: PreviewOptions): ConversionResult {
  const candidates: StoredCandidate[] = []
  const skipped: Skipped[] = []

  for (const master of parseRaw(raw).masters) {
    const early = skipReasonFor(master)
    if (early) {
      skipped.push({ index: master.index, name: master.name, reason: early })
      continue
    }
    const outline = outlineOf(flattenMaster(master))
    if (!outline) {
      skipped.push({ index: master.index, name: master.name, reason: SkipReason.NO_OUTLINE })
      continue
    }

    const normalized = normalizeRings([outline.footprint, ...outline.detail])
    if (normalized.widthIn <= 0 || normalized.heightIn <= 0) {
      skipped.push({ index: master.index, name: master.name, reason: SkipReason.NO_OUTLINE })
      continue
    }
    const { category, shapeKind: named } = classifyMaster(master.name, opts.fileName)
    const shapeKind = detailOrKind(named, normalized.widthIn, normalized.heightIn)
    candidates.push(
      StoredCandidateSchema.parse({
        index: master.index,
        name: master.name,
        category,
        shapeKind,
        drawingWidthIn: normalized.widthIn,
        drawingHeightIn: normalized.heightIn,
        ringCount: normalized.rings.length,
        thumbnailSvg: thumbnailSvg(normalized.rings, outline.fill, outline.stroke),
        fill: outline.fill,
        stroke: outline.stroke,
        rings: normalized.rings,
      }),
    )
  }

  return { candidates, skipped }
}
