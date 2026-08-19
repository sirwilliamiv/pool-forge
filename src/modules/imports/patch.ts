// Human edits to a `DesignIntent`. Pure and total: the command layer persists
// the result, this file only merges.
//
// Every optional key is assigned conditionally rather than spread. Under
// `exactOptionalPropertyTypes` spreading `{ field: undefined }` writes the key
// as `undefined`, which is a different type from an absent key.

import { z } from 'zod'

import {
  DeckIntentSchema,
  DesignIntentSchema,
  EnclosureIntentSchema,
  FeatureIntentSchema,
  MaterialsIntentSchema,
  PoolIntentSchema,
  ScaleSchema,
  SiteIntentSchema,
  type DesignIntent,
} from './intent'

export const DesignIntentPatchSchema = z
  .object({
    sourceImageIds: z.array(z.string()),
    pool: PoolIntentSchema.partial(),
    features: z.array(FeatureIntentSchema),
    deck: DeckIntentSchema.partial(),
    enclosure: EnclosureIntentSchema.partial(),
    site: SiteIntentSchema.partial(),
    materials: MaterialsIntentSchema.partial(),
    scale: ScaleSchema.partial(),
    fieldConfidence: z.record(z.string(), z.number().min(0).max(1)),
    warnings: z.array(z.string()),
  })
  .partial()

export type DesignIntentPatch = z.infer<typeof DesignIntentPatchSchema>

/**
 * Zod's `.partial()` yields `?: T | undefined`, which is a different type from
 * `Partial<T>` under `exactOptionalPropertyTypes`. Spelling the optionality out
 * here is what lets the patch types stay Zod-derived.
 */
type Loose<T> = { [K in keyof T]?: T[K] | undefined }

function assignDefined<T extends object>(target: T, patch: Loose<T> | undefined): T {
  if (!patch) return target
  const out: T = { ...target }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}

/**
 * Shallow-merges each section. Arrays (`features`, `warnings`) replace rather
 * than concatenate: the review UI edits the whole list, and an append-merge
 * would make an edit that removes a feature impossible to express.
 */
export function applyIntentPatch(intent: DesignIntent, patch: DesignIntentPatch): DesignIntent {
  const next: DesignIntent = {
    version: intent.version,
    sourceImageIds: patch.sourceImageIds ?? intent.sourceImageIds,
    pool: assignDefined(intent.pool, patch.pool),
    features: patch.features ?? intent.features,
    deck: assignDefined(intent.deck, patch.deck),
    enclosure: assignDefined(intent.enclosure, patch.enclosure),
    site: assignDefined(intent.site, patch.site),
    materials: assignDefined(intent.materials, patch.materials),
    scale: assignDefined(intent.scale, patch.scale),
    fieldConfidence: patch.fieldConfidence
      ? { ...intent.fieldConfidence, ...patch.fieldConfidence }
      : intent.fieldConfidence,
    warnings: patch.warnings ?? intent.warnings,
  }
  return next
}

/**
 * Dotted paths a patch touched. `import.intent.patch` returns these and the
 * `CommandAuditLog` row preserves them, which is how `import.intent.apply`
 * later proves a low-confidence field was reviewed by a human, and how
 * ordinary usage turns into labelled signal for prompt iteration.
 */
export function touchedPaths(patch: DesignIntentPatch): string[] {
  const paths: string[] = []
  for (const [section, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (Array.isArray(value) || value === null || typeof value !== 'object') {
      paths.push(section)
      continue
    }
    for (const [field, inner] of Object.entries(value as Record<string, unknown>)) {
      if (inner === undefined) continue
      paths.push(`${section}.${field}`)
    }
  }
  return paths.sort()
}

/** Reads a persisted `designIntentJson` column, falling back to `null`. */
export function parseStoredIntent(raw: unknown): DesignIntent | null {
  const parsed = DesignIntentSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
