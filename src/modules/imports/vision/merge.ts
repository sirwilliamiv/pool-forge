// Merge N per-image contributions into one DesignIntent.
//
// Two rules carry the weight:
//
//   1. Geometric authority follows the image kind, not the confidence score. A
//      SKETCH beats a CONCEPT_RENDER on geometry every time, even when the
//      render's model was more certain, because the render has no ground truth
//      to be certain about. A CONCEPT_RENDER cannot contribute a dimension at
//      all: its contributions are stripped again on the way in here.
//   2. Two images of the same kind resolve by confidence, and the loser is
//      recorded in a warning that names both images, so the reviewer sees the
//      disagreement rather than a silently chosen number.

import {
  emptyDesignIntent,
  type DeckMaterial,
  type DesignIntent,
  type EnclosureKind,
  type FeatureIntent,
  type ShapeFamily,
} from '@/modules/imports/intent'
import { assertNoGeometry } from './extractors/conceptRender'
import type { ExtractionGeometry, ImageKind, IntentContribution, PartialDesignIntent } from './types'

/**
 * Geometric authority by image kind. Higher wins regardless of confidence.
 * CONCEPT_RENDER, SITE_PHOTO and UNKNOWN sit at zero: they are incapable of
 * contributing a measurement, not merely unreliable at it.
 */
export const KIND_GEOMETRY_RANK: Record<ImageKind, number> = {
  SKETCH: 4,
  SITE_PLAN: 3,
  SCREENSHOT: 2,
  SITE_PHOTO: 0,
  CONCEPT_RENDER: 0,
  UNKNOWN: 0,
}

/** Kinds whose contributions are re-stripped of every measurement on entry. */
const GEOMETRY_INCAPABLE: ImageKind[] = ['CONCEPT_RENDER', 'SITE_PHOTO', 'UNKNOWN']

/** Confidence assumed for a value whose extractor did not score its path. */
const UNSCORED_CONFIDENCE = 0.5

/** Confidence-only paths: the value itself is produced by the precision layer. */
const CARRIED_CONFIDENCE_PATHS = [
  'pool.footprint',
  'deck.footprint',
  'enclosure.footprint',
  'site.propertyBoundary',
  'site.houseFootprint',
  'scale.pixelsPerInch',
] as const

interface Candidate<T> {
  value: T
  confidence: number
  kind: ImageKind
  rank: number
  sourceImageId: string
}

export interface MergeResult {
  intent: DesignIntent
  /** Image-space geometry, keyed by source image, for the precision layer. */
  geometryBySource: Record<string, ExtractionGeometry>
}

function confidenceFor(contribution: IntentContribution, path: string): number {
  const score = contribution.fieldConfidence[path]
  return score === undefined ? UNSCORED_CONFIDENCE : score
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return 'nothing'
  if (typeof value === 'number') return String(Math.round(value * 100) / 100)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function defaultEqual<T>(a: T, b: T): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return a === b
}

interface FieldSpec<T> {
  path: string
  geometric: boolean
  read: (intent: PartialDesignIntent) => T | null | undefined
  write: (target: DesignIntent, value: T) => void
  equal?: (a: T, b: T) => boolean
}

interface FieldOutcome {
  path: string
  confidence: number
  warnings: string[]
}

function resolveField<T>(
  spec: FieldSpec<T>,
  contributions: IntentContribution[],
  target: DesignIntent,
): FieldOutcome | null {
  const candidates: Candidate<T>[] = []
  for (const contribution of contributions) {
    if (spec.geometric && GEOMETRY_INCAPABLE.includes(contribution.kind)) continue
    const value = spec.read(contribution.intent)
    if (value === null || value === undefined) continue
    candidates.push({
      value,
      confidence: confidenceFor(contribution, spec.path),
      kind: contribution.kind,
      rank: KIND_GEOMETRY_RANK[contribution.kind],
      sourceImageId: contribution.sourceImageId,
    })
  }
  if (candidates.length === 0) return null

  const equal = spec.equal ?? defaultEqual
  const ordered = [...candidates].sort((a, b) => {
    if (spec.geometric && a.rank !== b.rank) return b.rank - a.rank
    if (a.confidence !== b.confidence) return b.confidence - a.confidence
    if (a.rank !== b.rank) return b.rank - a.rank
    return a.sourceImageId.localeCompare(b.sourceImageId)
  })

  const winner = ordered[0]
  if (winner === undefined) return null

  const warnings: string[] = []
  for (const loser of ordered.slice(1)) {
    if (equal(winner.value, loser.value)) continue
    if (loser.kind === winner.kind) {
      warnings.push(
        `${spec.path}: images ${winner.sourceImageId} and ${loser.sourceImageId} disagree (${describe(winner.value)} vs ${describe(loser.value)}). Kept ${describe(winner.value)} from ${winner.sourceImageId}, the higher confidence read (${winner.confidence.toFixed(2)} against ${loser.confidence.toFixed(2)}).`,
      )
    } else {
      warnings.push(
        `${spec.path}: image ${winner.sourceImageId} (${winner.kind}) and image ${loser.sourceImageId} (${loser.kind}) disagree (${describe(winner.value)} vs ${describe(loser.value)}). Kept ${describe(winner.value)} because a ${winner.kind} carries more authority for this field.`,
      )
    }
  }

  spec.write(target, winner.value)
  return { path: spec.path, confidence: winner.confidence, warnings }
}

const FIELD_SPECS: FieldSpec<never>[] = []

function field<T>(spec: FieldSpec<T>): void {
  FIELD_SPECS.push(spec as unknown as FieldSpec<never>)
}

field<ShapeFamily>({
  path: 'pool.shapeFamily',
  geometric: false,
  read: (intent) => (intent.pool?.shapeFamily === 'unknown' ? null : (intent.pool?.shapeFamily ?? null)),
  write: (target, value) => {
    target.pool.shapeFamily = value
  },
})
field<number>({
  path: 'pool.lengthFt',
  geometric: true,
  read: (intent) => intent.pool?.lengthFt ?? null,
  write: (target, value) => {
    target.pool.lengthFt = value
  },
})
field<number>({
  path: 'pool.widthFt',
  geometric: true,
  read: (intent) => intent.pool?.widthFt ?? null,
  write: (target, value) => {
    target.pool.widthFt = value
  },
})
field<number>({
  path: 'pool.depthShallowFt',
  geometric: true,
  read: (intent) => intent.pool?.depthShallowFt ?? null,
  write: (target, value) => {
    target.pool.depthShallowFt = value
  },
})
field<number>({
  path: 'pool.depthDeepFt',
  geometric: true,
  read: (intent) => intent.pool?.depthDeepFt ?? null,
  write: (target, value) => {
    target.pool.depthDeepFt = value
  },
})
field<DeckMaterial>({
  path: 'deck.material',
  geometric: false,
  read: (intent) => (intent.deck?.material === 'unknown' ? null : (intent.deck?.material ?? null)),
  write: (target, value) => {
    target.deck.material = value
  },
})
field<number>({
  path: 'deck.widthFt',
  geometric: true,
  read: (intent) => intent.deck?.widthFt ?? null,
  write: (target, value) => {
    target.deck.widthFt = value
  },
})
field<boolean>({
  path: 'enclosure.present',
  geometric: false,
  read: (intent) => intent.enclosure?.present ?? null,
  write: (target, value) => {
    target.enclosure.present = value
  },
})
field<EnclosureKind>({
  path: 'enclosure.kind',
  geometric: false,
  read: (intent) => (intent.enclosure?.kind === 'none' ? null : (intent.enclosure?.kind ?? null)),
  write: (target, value) => {
    target.enclosure.kind = value
  },
})
field<number>({
  path: 'enclosure.heightFt',
  geometric: true,
  read: (intent) => intent.enclosure?.heightFt ?? null,
  write: (target, value) => {
    target.enclosure.heightFt = value
  },
})
field<number>({
  path: 'site.northDeg',
  geometric: true,
  read: (intent) => intent.site?.northDeg ?? null,
  write: (target, value) => {
    target.site.northDeg = value
  },
})
field<NonNullable<DesignIntent['site']['setbacksFt']>>({
  path: 'site.setbacksFt',
  geometric: true,
  read: (intent) => intent.site?.setbacksFt ?? null,
  write: (target, value) => {
    target.site.setbacksFt = value
  },
})
for (const key of ['interiorFinish', 'copingMaterial', 'tileBand', 'deckMaterial'] as const) {
  field<string>({
    path: `materials.${key}`,
    geometric: false,
    read: (intent) => intent.materials?.[key] ?? null,
    write: (target, value) => {
      target.materials[key] = value
    },
  })
}

interface FeatureCandidate {
  label: string
  count: number
  lengthFt: number | null
  widthFt: number | null
  confidence: number
  rank: number
  sourceImageId: string
}

function mergeFeatures(contributions: IntentContribution[]): {
  features: FeatureIntent[]
  confidence: Record<string, number>
  warnings: string[]
} {
  const byLabel = new Map<string, FeatureCandidate>()
  const warnings: string[] = []

  for (const contribution of contributions) {
    const rank = KIND_GEOMETRY_RANK[contribution.kind]
    const geometryCapable = !GEOMETRY_INCAPABLE.includes(contribution.kind)
    ;(contribution.intent.features ?? []).forEach((feature, index) => {
      const key = feature.label.trim().toLowerCase()
      if (key === '') return
      const confidence = confidenceFor(contribution, `features.${index}.label`)
      const candidate: FeatureCandidate = {
        label: feature.label.trim(),
        count: feature.count,
        lengthFt: geometryCapable ? feature.lengthFt : null,
        widthFt: geometryCapable ? feature.widthFt : null,
        confidence,
        rank,
        sourceImageId: contribution.sourceImageId,
      }
      const existing = byLabel.get(key)
      if (existing === undefined) {
        byLabel.set(key, candidate)
        return
      }
      if (existing.count !== candidate.count) {
        warnings.push(
          `features "${existing.label}": images ${existing.sourceImageId} and ${candidate.sourceImageId} disagree on the count (${existing.count} vs ${candidate.count}). Kept ${Math.max(existing.count, candidate.count)}.`,
        )
      }
      byLabel.set(key, {
        label: existing.label,
        count: Math.max(existing.count, candidate.count),
        lengthFt: existing.rank >= candidate.rank ? (existing.lengthFt ?? candidate.lengthFt) : (candidate.lengthFt ?? existing.lengthFt),
        widthFt: existing.rank >= candidate.rank ? (existing.widthFt ?? candidate.widthFt) : (candidate.widthFt ?? existing.widthFt),
        confidence: Math.max(existing.confidence, candidate.confidence),
        rank: Math.max(existing.rank, candidate.rank),
        sourceImageId: existing.confidence >= candidate.confidence ? existing.sourceImageId : candidate.sourceImageId,
      })
    })
  }

  const ordered = [...byLabel.values()].sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank
    if (a.confidence !== b.confidence) return b.confidence - a.confidence
    return a.label.localeCompare(b.label)
  })

  const features: FeatureIntent[] = []
  const confidence: Record<string, number> = {}
  ordered.forEach((candidate, index) => {
    features.push({
      stencilId: null,
      label: candidate.label,
      lengthFt: candidate.lengthFt,
      widthFt: candidate.widthFt,
      count: candidate.count,
      x: null,
      y: null,
    })
    confidence[`features.${index}.label`] = candidate.confidence
  })

  return { features, confidence, warnings }
}

/**
 * Fold every per-image contribution into one intent. Pure: no model calls, no
 * database, deterministic for a given input order.
 */
export function mergeContributions(input: IntentContribution[]): MergeResult {
  // Defence in depth. The extractors already strip these, and the merge layer
  // strips them again rather than trusting a caller-assembled contribution.
  const contributions = input.map((contribution) =>
    GEOMETRY_INCAPABLE.includes(contribution.kind) ? assertNoGeometry(contribution) : contribution,
  )

  const sourceImageIds = contributions.map((contribution) => contribution.sourceImageId)
  const intent = emptyDesignIntent(sourceImageIds)
  const fieldConfidence: Record<string, number> = {}
  const warnings: string[] = []

  for (const contribution of contributions) {
    warnings.push(...contribution.warnings)
  }

  for (const spec of FIELD_SPECS) {
    const outcome = resolveField(spec, contributions, intent)
    if (outcome === null) continue
    fieldConfidence[outcome.path] = outcome.confidence
    warnings.push(...outcome.warnings)
  }

  const merged = mergeFeatures(contributions)
  intent.features = merged.features
  Object.assign(fieldConfidence, merged.confidence)
  warnings.push(...merged.warnings)

  // Notes accumulate from every image; duplicates across images are dropped.
  const notes: string[] = []
  for (const contribution of contributions) {
    for (const note of contribution.intent.site?.notes ?? []) {
      const trimmed = note.trim()
      if (trimmed !== '' && !notes.includes(trimmed)) notes.push(trimmed)
    }
  }
  intent.site.notes = notes

  // Confidence for values the precision layer will fill in, so the review UI
  // can badge a footprint that has not been produced yet.
  for (const path of CARRIED_CONFIDENCE_PATHS) {
    let best: { confidence: number; rank: number } | null = null
    for (const contribution of contributions) {
      if (GEOMETRY_INCAPABLE.includes(contribution.kind)) continue
      const score = contribution.fieldConfidence[path]
      if (score === undefined) continue
      const rank = KIND_GEOMETRY_RANK[contribution.kind]
      if (best === null || rank > best.rank || (rank === best.rank && score > best.confidence)) {
        best = { confidence: score, rank }
      }
    }
    if (best !== null) fieldConfidence[path] = best.confidence
  }

  intent.fieldConfidence = fieldConfidence
  intent.warnings = warnings

  const geometryBySource: Record<string, ExtractionGeometry> = {}
  for (const contribution of contributions) {
    if (contribution.geometry !== null) geometryBySource[contribution.sourceImageId] = contribution.geometry
  }

  return { intent, geometryBySource }
}
