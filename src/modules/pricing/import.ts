import { read, utils } from 'xlsx'
import { PriceCategory, UnitType } from '@prisma/client'

export { PriceCategory, UnitType }

export interface ImportRow {
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: number
  unitCost?: number
  customerVisible?: boolean
}

export interface ImportPreview {
  headers: string[]
  rows: Record<string, unknown>[]
  detectedMapping: Partial<Record<keyof ImportRow, string>>
}

export interface RowError {
  rowIndex: number
  message: string
}

export function parseSheet(buffer: ArrayBuffer): ImportPreview {
  const wb = read(buffer, { type: 'array' })
  const firstName = wb.SheetNames[0]
  if (!firstName) return { headers: [], rows: [], detectedMapping: {} }
  const sheet = wb.Sheets[firstName]
  if (!sheet) return { headers: [], rows: [], detectedMapping: {} }

  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const first = rows[0]
  const headers = first ? Object.keys(first) : []

  const find = (...needles: string[]): string | undefined =>
    headers.find((h) => needles.some((n) => h.toLowerCase().includes(n)))

  const detectedMapping: ImportPreview['detectedMapping'] = {}
  const cat = find('category', 'cat')
  if (cat) detectedMapping.category = cat
  const name = find('name', 'item', 'description')
  if (name) detectedMapping.name = name
  const unit = find('unit type', 'unit', 'uom')
  if (unit) detectedMapping.unitType = unit
  const retail = find('retail', 'price', 'sell')
  if (retail) detectedMapping.retailPrice = retail
  const cost = find('cost')
  if (cost) detectedMapping.unitCost = cost
  const visible = find('visible', 'show')
  if (visible) detectedMapping.customerVisible = visible

  return { headers, rows, detectedMapping }
}

function coerceNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[$,\s]/g, '')
    if (cleaned === '') return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function coerceBool(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(v)) return true
    if (['false', 'no', 'n', '0'].includes(v)) return false
  }
  if (typeof raw === 'number') return raw !== 0
  return undefined
}

// Map free-form unit strings from spreadsheets to a typed UnitType enum.
function normalizeUnit(raw: unknown): UnitType {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return UnitType.EACH
  if (v.includes('sq')) return UnitType.SQFT
  if (v === 'lf' || v.includes('linear') || v === 'ft') return UnitType.LF
  if (v.includes('each') || v === 'ea') return UnitType.EACH
  if (v.includes('lump') || v === 'ls') return UnitType.LUMP
  if (v.includes('hour') || v === 'hr') return UnitType.HOUR
  return UnitType.EACH
}

// Map free-form category strings to a typed PriceCategory enum.
function normalizeCategory(raw: unknown): PriceCategory {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return PriceCategory.MISC
  if (v.includes('pool')) return PriceCategory.POOL
  if (v.includes('spa')) return PriceCategory.SPA
  if (v.includes('deck')) return PriceCategory.DECK
  if (v.includes('coping')) return PriceCategory.COPING
  if (v.includes('equip')) return PriceCategory.EQUIPMENT
  if (v.includes('light')) return PriceCategory.LIGHTING
  if (v.includes('screen')) return PriceCategory.SCREEN
  if (v.includes('bench')) return PriceCategory.BENCH
  if (v.includes('drain')) return PriceCategory.DRAIN
  if (v.includes('elec')) return PriceCategory.ELECTRICAL
  if (v.includes('water')) return PriceCategory.WATER_FEATURE
  if (v.includes('fence')) return PriceCategory.FENCE
  if (v.includes('wall')) return PriceCategory.WALL
  if (v.includes('lanai')) return PriceCategory.LANAI
  return PriceCategory.MISC
}

export function rowsToItems(
  rows: Record<string, unknown>[],
  mapping: Partial<Record<keyof ImportRow, string>>,
): { items: ImportRow[]; errors: RowError[] } {
  const items: ImportRow[] = []
  const errors: RowError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const nameKey = mapping.name
    const retailKey = mapping.retailPrice
    if (!nameKey || !retailKey) {
      errors.push({ rowIndex: i, message: 'Missing required column mapping (name or retail price)' })
      continue
    }

    const rawName = row[nameKey]
    const name = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim()
    if (!name) {
      errors.push({ rowIndex: i, message: 'Empty name' })
      continue
    }

    const retail = coerceNumber(row[retailKey])
    if (retail === null) {
      errors.push({ rowIndex: i, message: `Invalid retail price "${row[retailKey]}"` })
      continue
    }
    if (retail < 0) {
      errors.push({ rowIndex: i, message: 'Retail price must be ≥ 0' })
      continue
    }

    const category = normalizeCategory(mapping.category ? row[mapping.category] : '')
    const unitType = normalizeUnit(mapping.unitType ? row[mapping.unitType] : '')

    const item: ImportRow = { category, name, unitType, retailPrice: retail }
    if (mapping.unitCost) {
      const cost = coerceNumber(row[mapping.unitCost])
      if (cost !== null) item.unitCost = cost
    }
    if (mapping.customerVisible) {
      const v = coerceBool(row[mapping.customerVisible])
      if (v !== undefined) item.customerVisible = v
    }
    items.push(item)
  }

  return { items, errors }
}
