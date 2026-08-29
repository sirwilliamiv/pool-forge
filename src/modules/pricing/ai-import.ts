import { PriceCategory, UnitType } from '@prisma/client'
import { z } from 'zod'

import type { VisionClient } from '@/modules/imports/vision/client'
import { parseModelJson } from '@/modules/imports/vision/json'

import type { ImportPreview, ImportRow } from './import'

// Reading a builder's own price list, whatever shape it arrives in.
//
// The importer already reads a sheet and guesses its columns by keyword, which
// works on a file written to suit us and not on the one a builder actually has.
// Real price lists say "U/M", "Sell $", "Item Description", "Labor Cost/EA",
// and put the category in the item name or in nothing at all.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: the model chooses which column means
// what, and which bucket a line belongs in. It never supplies a value. Every
// price, every quantity and every name is read from the file by code. A model
// that invents a number puts that number on a quote, and then on a contract,
// and nobody would ever catch it. So the model is asked for a mapping, the
// mapping is checked against the real headers, and the sheet is applied to it.

/** Categories nothing can bill against, so importing into one is a silent loss. */
const UNBILLABLE: ReadonlySet<PriceCategory> = new Set([
  PriceCategory.LANAI,
  PriceCategory.FENCE,
  PriceCategory.WALL,
  PriceCategory.ELECTRICAL,
  PriceCategory.MISC,
])

/** Rows shown to the model. Enough to see the shape, not the whole book. */
export const SAMPLE_ROWS = 12

export const AI_MAPPING_STAGE = 'price-book-mapping'

/**
 * Reading a spreadsheet's headers is a small job, so the fast model does it.
 *
 * Served only on the global endpoint, which is why `VERTEX_LOCATION` matters
 * here: a regional endpoint answers 404 for this name.
 */
export const DEFAULT_MAPPING_MODEL = 'gemini-3-flash-preview'

const columnMap = z.object({
  name: z.string().nullable(),
  retailPrice: z.string().nullable(),
  unitType: z.string().nullable().optional(),
  unitCost: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  customerVisible: z.string().nullable().optional(),
})

const categoryGuess = z.object({
  /** The value as it appears in the sheet, so the mapping can be applied by lookup. */
  source: z.string().min(1),
  category: z.nativeEnum(PriceCategory),
  unitType: z.nativeEnum(UnitType).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export const aiMappingSchema = z.object({
  columns: columnMap,
  /** How each distinct category label in the sheet maps onto ours. */
  categories: z.array(categoryGuess).default([]),
  /** Anything the model wants a human to look at, in plain words. */
  notes: z.array(z.string()).default([]),
})

export type AiMapping = z.infer<typeof aiMappingSchema>

export interface MappingOutcome {
  mapping: AiMapping
  /** Header names the model claimed that are not in the sheet. Dropped, never used. */
  invented: string[]
  /** Source categories that landed somewhere nothing can bill. */
  unbillable: string[]
}

/**
 * What the model is asked. Deliberately narrow.
 *
 * It sees the headers and a handful of rows, and answers with column names and
 * category labels that must already exist in the file. It is never asked what
 * anything costs, and it is told so, because a model that believes prices are
 * its job will happily supply them.
 */
export function buildMappingPrompt(preview: Pick<ImportPreview, 'headers' | 'rows'>): string {
  const sample = preview.rows.slice(0, SAMPLE_ROWS)
  return [
    'You are mapping a swimming pool contractor\'s price list onto a fixed schema.',
    '',
    'Return ONLY JSON of this shape:',
    '{',
    '  "columns": { "name": <header|null>, "retailPrice": <header|null>,',
    '               "unitType": <header|null>, "unitCost": <header|null>,',
    '               "category": <header|null>, "customerVisible": <header|null> },',
    '  "categories": [ { "source": <value as written in the sheet>,',
    '                    "category": <one of the categories below>,',
    '                    "unitType": <one of the units below>,',
    '                    "confidence": <0..1> } ],',
    '  "notes": [ <short sentence for a human> ]',
    '}',
    '',
    `Categories: ${Object.values(PriceCategory).join(', ')}`,
    `Units: ${Object.values(UnitType).join(', ')}`,
    '',
    'Rules:',
    '- Every value in "columns" must be one of the headers listed below, exactly, or null.',
    '- Do NOT return prices, quantities, or any figure. Only column names and category labels.',
    '- "retailPrice" is what the customer is charged. "unitCost" is what the builder pays.',
    '  If only one money column exists it is the retail price.',
    '- In "categories", "source" must be a value that appears in the sheet. If the sheet has',
    '  no category column, use the item name and map each distinct item.',
    '- If you are unsure, say so in "notes" rather than guessing confidently.',
    '',
    `Headers: ${JSON.stringify(preview.headers)}`,
    `First ${sample.length} rows: ${JSON.stringify(sample)}`,
  ].join('\n')
}

/**
 * Ask the model how this sheet maps onto our schema, and refuse what it invents.
 *
 * A column the model names that is not in the file is dropped rather than
 * trusted: it means the model was writing what it expected to see rather than
 * reading. Same for a category value that appears nowhere in the sheet, since
 * the mapping is applied by lookup and a phantom key would never match anyway.
 */
export async function inferMapping(
  client: VisionClient,
  preview: Pick<ImportPreview, 'headers' | 'rows'>,
  options: { model?: string } = {},
): Promise<MappingOutcome> {
  const result = await client.generate({
    model: options.model ?? DEFAULT_MAPPING_MODEL,
    prompt: buildMappingPrompt(preview),
    stage: AI_MAPPING_STAGE,
    temperature: 0,
  })

  const parsed = parseModelJson(result.text)
  if (!parsed.ok) throw new Error('The price list could not be read. Map the columns by hand.')

  const validated = aiMappingSchema.safeParse(parsed.value)
  if (!validated.success) throw new Error('The price list could not be read. Map the columns by hand.')

  return sanitizeMapping(validated.data, preview)
}

/**
 * Keep only what the sheet can back up.
 *
 * Split out from the call so it can be tested against a mapping nobody had to
 * generate, and so a hand-edited mapping goes through the same gate.
 */
export function sanitizeMapping(
  mapping: AiMapping,
  preview: Pick<ImportPreview, 'headers' | 'rows'>,
): MappingOutcome {
  const headers = new Set(preview.headers)
  const invented: string[] = []

  const columns = { ...mapping.columns } as Record<string, string | null | undefined>
  for (const [field, header] of Object.entries(columns)) {
    if (header === null || header === undefined) continue
    if (!headers.has(header)) {
      invented.push(header)
      columns[field] = null
    }
  }

  // Values actually present in the sheet, so a phantom source is caught here
  // rather than silently never matching at import time.
  const present = new Set<string>()
  for (const row of preview.rows) {
    for (const value of Object.values(row)) {
      if (typeof value === 'string' && value.trim()) present.add(value.trim().toLowerCase())
    }
  }

  const categories = mapping.categories.filter((guess) => present.has(guess.source.trim().toLowerCase()))
  for (const guess of mapping.categories) {
    if (!present.has(guess.source.trim().toLowerCase())) invented.push(guess.source)
  }

  const unbillable = categories
    .filter((guess) => UNBILLABLE.has(guess.category))
    .map((guess) => guess.source)

  return {
    mapping: { ...mapping, columns: columns as AiMapping['columns'], categories },
    invented,
    unbillable,
  }
}

/**
 * The mapping in the shape the existing importer already understands.
 *
 * Deliberately reuses `rowsToItems` rather than building rows here: that
 * function is where money is parsed, and money should be parsed in exactly one
 * place whether a human or a model chose the column.
 */
export function toDetectedMapping(mapping: AiMapping): Partial<Record<keyof ImportRow, string>> {
  const out: Partial<Record<keyof ImportRow, string>> = {}
  const { columns } = mapping
  if (columns.name) out.name = columns.name
  if (columns.retailPrice) out.retailPrice = columns.retailPrice
  if (columns.unitType) out.unitType = columns.unitType
  if (columns.unitCost) out.unitCost = columns.unitCost
  if (columns.category) out.category = columns.category
  if (columns.customerVisible) out.customerVisible = columns.customerVisible
  return out
}

/**
 * Is this mapping worth showing a builder at all?
 *
 * Without a name and a price there is no price book, only a spreadsheet, and
 * offering a preview of nothing wastes the one moment they are paying
 * attention.
 */
export function isUsable(mapping: AiMapping): boolean {
  return Boolean(mapping.columns.name && mapping.columns.retailPrice)
}
