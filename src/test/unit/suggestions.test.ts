import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ValidationItem } from '@/modules/validation/types'

vi.mock('@/lib/db', () => ({
  db: {
    validationResult: {
      findFirst: vi.fn(),
    },
  },
}))

const { getSuggestions, runnableSuggestions } = await import('@/lib/commands/suggestions')
const { db } = await import('@/lib/db')
const { initCommands } = await import('@/modules/commands/init')
const { get } = await import('@/modules/commands/registry')

initCommands()

/**
 * The check that was missing.
 *
 * Every row under "Suggested for this design" was posted to the server and
 * changed nothing: three of them named no command at all, and the wrapper the
 * others went through had no client handler. Nothing failed, because nothing
 * had ever asked whether a suggestion could run.
 */
function assertRunnable(suggestions: Awaited<ReturnType<typeof getSuggestions>>): void {
  expect(suggestions.length, 'no suggestions to check').toBeGreaterThan(0)
  for (const suggestion of suggestions) {
    expect(
      suggestion.innerCommandId,
      `${suggestion.id} is offered with no command behind it, so clicking it does nothing`,
    ).toBeTruthy()

    const command = get(suggestion.innerCommandId as string)
    expect(command, `${suggestion.id} names an unregistered command`).toBeTruthy()

    const parsed = command!.inputSchema.safeParse(suggestion.innerInput ?? {})
    expect(
      parsed.success,
      `${suggestion.id} would show the user a validation error from ${suggestion.innerCommandId}`,
    ).toBe(true)
  }
}

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

  it('every suggestion it offers can actually be run', async () => {
    const items: ValidationItem[] = [
      {
        id: 'rule-1',
        level: 'error',
        category: 'pool',
        message: 'Set both shallow and deep end depths',
        field: 'depthShallow',
        suggestedFix: 'Enter shallow + deep depth in the Geometry section',
      },
      { id: 'rule-2', level: 'warn', category: 'equipment', message: 'Heater BTU undersized' },
    ]
    mockedFindFirst.mockResolvedValue({ id: 'vr1', projectId: 'p1', runAt: new Date(), items })

    assertRunnable(await getSuggestions({ projectId: 'p1' }))
  })

  it('every hint it offers with no validation run can actually be run', async () => {
    mockedFindFirst.mockResolvedValue(null)
    assertRunnable(await getSuggestions({ projectId: 'p1' }))
  })

  it('never prints an internal field name at the user', async () => {
    // "POOL → DEPTHSHALLOW" is what a builder used to read under a suggestion.
    const items: ValidationItem[] = [
      { id: 'rule-1', level: 'error', category: 'pool', message: 'Depth missing', field: 'depthShallow' },
    ]
    mockedFindFirst.mockResolvedValue({ id: 'vr1', projectId: 'p1', runAt: new Date(), items })

    const out = await getSuggestions({ projectId: 'p1' })
    const description = out.find((s) => s.id === 'validation.rule-1')?.description ?? ''
    expect(description).not.toContain('depthShallow')
    expect(description).toContain('depth shallow')
  })

  it('prefers the rule\'s own fix wording when it has one', async () => {
    const items: ValidationItem[] = [
      {
        id: 'rule-1',
        level: 'error',
        category: 'pool',
        message: 'Depth missing',
        field: 'depthShallow',
        suggestedFix: 'Enter shallow + deep depth in the Geometry section',
      },
    ]
    mockedFindFirst.mockResolvedValue({ id: 'vr1', projectId: 'p1', runAt: new Date(), items })

    const out = await getSuggestions({ projectId: 'p1' })
    expect(out.find((s) => s.id === 'validation.rule-1')?.description).toBe(
      'Enter shallow + deep depth in the Geometry section',
    )
  })

  describe('runnableSuggestions', () => {
    const base = { id: 'test', label: 'test', source: 'hint' as const }

    it('drops a suggestion with no command behind it', () => {
      // The worst outcome in the palette: the row closes, nothing happens, and
      // the user believes it worked.
      expect(runnableSuggestions([{ ...base }])).toEqual([])
    })

    it('drops a suggestion naming a command that does not exist', () => {
      expect(
        runnableSuggestions([{ ...base, innerCommandId: 'pool.make.magic', innerInput: {} }]),
      ).toEqual([])
    })

    it('drops a suggestion whose input its command would refuse', () => {
      // The other failure a reviewer saw: a row that runs and returns a
      // validation error.
      expect(runnableSuggestions([{ ...base, innerCommandId: 'nav.focus', innerInput: {} }])).toEqual([])
    })

    it('keeps a suggestion that will run', () => {
      const good = { ...base, innerCommandId: 'nav.focus', innerInput: { target: 'validation' } }
      expect(runnableSuggestions([good])).toEqual([good])
    })
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
