// The field table the review pane renders.
//
// One descriptor per correctable `DesignIntent` field. `path` is the dotted
// key the extractor scores in `fieldConfidence` and the key `touchedPaths()`
// records when a human corrects it, so the same string drives the confidence
// badge, the review queue, and the click-to-jump target id. Keeping that in
// one table is what stops the three from drifting apart.

import {
  DECK_MATERIALS,
  ENCLOSURE_KINDS,
  SHAPE_FAMILIES,
  type DesignIntent,
} from '@/modules/imports/intent'
import type { DesignIntentPatch } from '@/modules/imports/patch'

export const INTENT_GROUPS = [
  'pool',
  'features',
  'deck',
  'enclosure',
  'materials',
  'site',
] as const
export type IntentGroupId = (typeof INTENT_GROUPS)[number]

export interface IntentGroupMeta {
  id: IntentGroupId
  label: string
  blurb: string
}

export const INTENT_GROUP_META: Record<IntentGroupId, IntentGroupMeta> = {
  pool: { id: 'pool', label: 'Pool', blurb: 'Footprint, family, and the numbers a quote is priced from' },
  features: { id: 'features', label: 'Features', blurb: 'Spas, shelves, benches, and anything else read off the image' },
  deck: { id: 'deck', label: 'Deck', blurb: 'Surrounding hardscape and its material' },
  enclosure: { id: 'enclosure', label: 'Enclosure', blurb: 'Screen or lanai structure over the pool' },
  materials: { id: 'materials', label: 'Materials', blurb: 'Finishes named in the image or its caption' },
  site: { id: 'site', label: 'Site', blurb: 'Property boundary, setbacks, and orientation' },
}

export type FieldValue = string | number | boolean | null

export type FieldControl =
  | { kind: 'number'; unit: string; step: number }
  | { kind: 'text'; placeholder: string }
  | { kind: 'select'; options: readonly string[] }
  | { kind: 'boolean' }

export interface IntentFieldDescriptor {
  /** Dotted `DesignIntent` path. Doubles as the DOM id for click-to-jump. */
  path: string
  label: string
  group: IntentGroupId
  /** One short line explaining what the number means, shown on the row. */
  hint: string
  control: FieldControl
  read: (intent: DesignIntent) => FieldValue
  /** Null when the raw input cannot be turned into a legal value. */
  write: (raw: string | boolean) => DesignIntentPatch | null
}

/** Blank clears the field. Anything non-numeric or non-positive is rejected. */
function positiveOrNull(raw: string | boolean): number | null | undefined {
  if (typeof raw === 'boolean') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

function finiteOrNull(raw: string | boolean): number | null | undefined {
  if (typeof raw === 'boolean') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return undefined
  return n
}

function textOrNull(raw: string | boolean): string | null {
  if (typeof raw === 'boolean') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export const INTENT_FIELDS: readonly IntentFieldDescriptor[] = [
  {
    path: 'pool.shapeFamily',
    label: 'Pool shape family',
    group: 'pool',
    hint: 'Picks the primitive the footprint is fitted to',
    control: { kind: 'select', options: SHAPE_FAMILIES },
    read: (i) => i.pool.shapeFamily,
    write: (raw) => {
      if (typeof raw !== 'string') return null
      const match = SHAPE_FAMILIES.find((f) => f === raw)
      return match ? { pool: { shapeFamily: match } } : null
    },
  },
  {
    path: 'pool.lengthFt',
    label: 'Pool length',
    group: 'pool',
    hint: 'Long axis of the water surface',
    control: { kind: 'number', unit: 'ft', step: 0.5 },
    read: (i) => i.pool.lengthFt,
    write: (raw) => {
      const v = positiveOrNull(raw)
      return v === undefined ? null : { pool: { lengthFt: v } }
    },
  },
  {
    path: 'pool.widthFt',
    label: 'Pool width',
    group: 'pool',
    hint: 'Short axis of the water surface',
    control: { kind: 'number', unit: 'ft', step: 0.5 },
    read: (i) => i.pool.widthFt,
    write: (raw) => {
      const v = positiveOrNull(raw)
      return v === undefined ? null : { pool: { widthFt: v } }
    },
  },
  {
    path: 'pool.depthShallowFt',
    label: 'Shallow depth',
    group: 'pool',
    hint: 'Rarely legible in an image, so usually worth confirming',
    control: { kind: 'number', unit: 'ft', step: 0.25 },
    read: (i) => i.pool.depthShallowFt,
    write: (raw) => {
      const v = positiveOrNull(raw)
      return v === undefined ? null : { pool: { depthShallowFt: v } }
    },
  },
  {
    path: 'pool.depthDeepFt',
    label: 'Deep depth',
    group: 'pool',
    hint: 'Drives water volume, so it drives the chemical and heater lines',
    control: { kind: 'number', unit: 'ft', step: 0.25 },
    read: (i) => i.pool.depthDeepFt,
    write: (raw) => {
      const v = positiveOrNull(raw)
      return v === undefined ? null : { pool: { depthDeepFt: v } }
    },
  },
  {
    path: 'deck.material',
    label: 'Deck material',
    group: 'deck',
    hint: 'Chooses the deck line item in the price book',
    control: { kind: 'select', options: DECK_MATERIALS },
    read: (i) => i.deck.material,
    write: (raw) => {
      if (typeof raw !== 'string') return null
      const match = DECK_MATERIALS.find((m) => m === raw)
      return match ? { deck: { material: match } } : null
    },
  },
  {
    path: 'deck.widthFt',
    label: 'Deck width',
    group: 'deck',
    hint: 'Band of hardscape measured out from the water edge',
    control: { kind: 'number', unit: 'ft', step: 0.5 },
    read: (i) => i.deck.widthFt,
    write: (raw) => {
      const v = positiveOrNull(raw)
      return v === undefined ? null : { deck: { widthFt: v } }
    },
  },
  {
    path: 'enclosure.present',
    label: 'Enclosure present',
    group: 'enclosure',
    hint: 'Turn off if the structure in the image is not part of the scope',
    control: { kind: 'boolean' },
    read: (i) => i.enclosure.present,
    write: (raw) => (typeof raw === 'boolean' ? { enclosure: { present: raw } } : null),
  },
  {
    path: 'enclosure.kind',
    label: 'Enclosure kind',
    group: 'enclosure',
    hint: 'Screen cages and lanais price very differently',
    control: { kind: 'select', options: ENCLOSURE_KINDS },
    read: (i) => i.enclosure.kind,
    write: (raw) => {
      if (typeof raw !== 'string') return null
      const match = ENCLOSURE_KINDS.find((k) => k === raw)
      return match ? { enclosure: { kind: match } } : null
    },
  },
  {
    path: 'enclosure.heightFt',
    label: 'Enclosure height',
    group: 'enclosure',
    hint: 'Mean height at the ridge',
    control: { kind: 'number', unit: 'ft', step: 0.5 },
    read: (i) => i.enclosure.heightFt,
    write: (raw) => {
      const v = positiveOrNull(raw)
      return v === undefined ? null : { enclosure: { heightFt: v } }
    },
  },
  {
    path: 'materials.interiorFinish',
    label: 'Interior finish',
    group: 'materials',
    hint: 'Plaster, pebble, quartz, tile',
    control: { kind: 'text', placeholder: 'Not read' },
    read: (i) => i.materials.interiorFinish,
    write: (raw) => ({ materials: { interiorFinish: textOrNull(raw) } }),
  },
  {
    path: 'materials.copingMaterial',
    label: 'Coping',
    group: 'materials',
    hint: 'Cantilever, bullnose, travertine',
    control: { kind: 'text', placeholder: 'Not read' },
    read: (i) => i.materials.copingMaterial,
    write: (raw) => ({ materials: { copingMaterial: textOrNull(raw) } }),
  },
  {
    path: 'materials.tileBand',
    label: 'Waterline tile',
    group: 'materials',
    hint: 'Band at the waterline, if the image shows one',
    control: { kind: 'text', placeholder: 'Not read' },
    read: (i) => i.materials.tileBand,
    write: (raw) => ({ materials: { tileBand: textOrNull(raw) } }),
  },
  {
    path: 'materials.deckMaterial',
    label: 'Deck finish note',
    group: 'materials',
    hint: 'Free text from the image, kept alongside the priced deck material',
    control: { kind: 'text', placeholder: 'Not read' },
    read: (i) => i.materials.deckMaterial,
    write: (raw) => ({ materials: { deckMaterial: textOrNull(raw) } }),
  },
  {
    path: 'site.northDeg',
    label: 'North',
    group: 'site',
    hint: 'Degrees clockwise from the top of the image to true north',
    control: { kind: 'number', unit: 'deg', step: 1 },
    read: (i) => i.site.northDeg,
    write: (raw) => {
      const v = finiteOrNull(raw)
      return v === undefined ? null : { site: { northDeg: v } }
    },
  },
]

const BY_PATH: ReadonlyMap<string, IntentFieldDescriptor> = new Map(
  INTENT_FIELDS.map((f) => [f.path, f]),
)

export function fieldByPath(path: string): IntentFieldDescriptor | undefined {
  return BY_PATH.get(path)
}

export function fieldsInGroup(group: IntentGroupId): IntentFieldDescriptor[] {
  return INTENT_FIELDS.filter((f) => f.group === group)
}

/** DOM id for click-to-jump, mirroring how `ValidationDock` targets shapes. */
export function fieldDomId(path: string): string {
  return `intent-field-${path.replace(/\./g, '-')}`
}

/**
 * Readable name for a dotted path. Falls back to a de-camelised rendering so a
 * confidence key the field table does not cover ("features.0.count") still
 * reads as words rather than as a raw internal key.
 */
export function labelForPath(path: string): string {
  const known = BY_PATH.get(path)
  if (known) return known.label

  const segments = path.split('.')
  const words = segments
    .filter((s) => !/^\d+$/.test(s))
    .map((s) =>
      s
        .replace(/Ft$/, '')
        .replace(/Deg$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase(),
    )
    .filter((s) => s.length > 0)

  const index = segments.find((s) => /^\d+$/.test(s))
  const base = words.join(' ')
  const readable = base.charAt(0).toUpperCase() + base.slice(1)
  return index === undefined ? readable : `${readable} ${Number(index) + 1}`
}

/**
 * The group a dotted path belongs to, so a blocking path with no field row
 * still jumps somewhere sensible.
 */
export function groupForPath(path: string): IntentGroupId | null {
  const known = BY_PATH.get(path)
  if (known) return known.group
  const head = path.split('.')[0]
  const match = INTENT_GROUPS.find((g) => g === head)
  return match ?? null
}
