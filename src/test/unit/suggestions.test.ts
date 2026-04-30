import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ValidationItem } from '@/modules/validation/types'

vi.mock('@/lib/db', () => ({
  db: {
    validationResult: {
      findFirst: vi.fn(),
    },
  },
}))

const { getSuggestions } = await import('@/lib/commands/suggestions')
const { db } = await import('@/lib/db')

const mockedFindFirst = db.validationResult.findFirst as unknown as ReturnType<typeof vi.fn>

describe('getSuggestions', () => {
  beforeEach(() => {
    mockedFindFirst.mockReset()
  })

  it('converts validation items to suggestions, dropping pass items', async () => {
    const items: ValidationItem[] = [
      { id: 'rule-1', level: 'error', category: 'pool', message: 'Spillover elevation low' },
      { id: 'rule-2', level: 'pass', category: 'project', message: 'Project name set' },
      { id: 'rule-3', level: 'warn', category: 'equipment', message: 'Heater BTU undersized', field: 'heater' },
    ]
    mockedFindFirst.mockResolvedValue({
      id: 'vr1',
      projectId: 'p1',
      runAt: new Date(),
      items,
    })

    const out = await getSuggestions({ projectId: 'p1' })

    expect(out.length).toBeLessThanOrEqual(5)
    const labels = out.map((s) => s.label)
    expect(labels).toContain('Spillover elevation low')
    expect(labels).toContain('Heater BTU undersized')
    expect(labels).not.toContain('Project name set')
    const errorRow = out.find((s) => s.id === 'validation.rule-1')!
    expect(errorRow.source).toBe('validation')
    expect(errorRow.level).toBe('error')
  })

  it('returns rotating hints when no validation issues exist', async () => {
    mockedFindFirst.mockResolvedValue(null)
    const out = await getSuggestions({ projectId: 'p1' })
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((s) => s.source === 'hint')).toBe(true)
  })

  it('hides selection-dependent hints when no selection is provided', async () => {
    mockedFindFirst.mockResolvedValue(null)
    const out = await getSuggestions({ projectId: 'p1' })
    expect(out.some((s) => s.id === 'hint.add-tanning-ledge-south')).toBe(false)
  })

  it('includes selection-dependent hints when selection is provided', async () => {
    mockedFindFirst.mockResolvedValue(null)
    const out = await getSuggestions({ projectId: 'p1', selection: ['shape-1'] })
    expect(out.some((s) => s.id === 'hint.add-tanning-ledge-south')).toBe(true)
  })

  it('caps results at 5', async () => {
    const items: ValidationItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `rule-${i}`,
      level: 'warn',
      category: 'pool',
      message: `Issue ${i}`,
    }))
    mockedFindFirst.mockResolvedValue({ id: 'vr1', projectId: 'p1', runAt: new Date(), items })
    const out = await getSuggestions({ projectId: 'p1' })
    expect(out.length).toBeLessThanOrEqual(5)
  })
})
