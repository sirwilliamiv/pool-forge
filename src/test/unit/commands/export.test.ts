import { beforeAll, describe, expect, it } from 'vitest'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext } from '@/modules/commands/registry'
import { exportDocumentUrl } from '@/modules/exports/routes'

const anonCtx: CommandContext = { userId: 'anonymous', orgId: 'anonymous' }

beforeAll(() => {
  initCommands()
})

describe('export command schemas', () => {
  it('every export command requires a projectId', () => {
    for (const id of [
      'export.customerProposal',
      'export.constructionPacket',
      'export.sitePlan',
      'export.screenEnclosureQuote',
    ]) {
      const c = get(id)!
      expect(c, `${id} is not registered`).toBeDefined()
      expect(c.inputSchema.safeParse({}).success, `${id} accepted an empty input`).toBe(false)
      expect(c.inputSchema.safeParse({ projectId: 'p1' }).success).toBe(true)
    }
  })

  it('construction packet defaults to tabloid', () => {
    const parsed = get('export.constructionPacket')!.inputSchema.safeParse({ projectId: 'p1' })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect((parsed.data as { pageSize: string }).pageSize).toBe('tabloid')
  })

  it('screen RFQ hides pricing by default', () => {
    const parsed = get('export.screenEnclosureQuote')!.inputSchema.safeParse({ projectId: 'p1' })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const data = parsed.data as { showInternalPricing: boolean; showScreenScopeRetail: boolean }
    expect(data.showInternalPricing).toBe(false)
    expect(data.showScreenScopeRetail).toBe(false)
  })

  it('refuses to record an export for an unauthenticated caller', async () => {
    const res = await get('export.sitePlan')!.execute({ projectId: 'p1' }, anonCtx)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('Not authenticated')
  })
})

describe('export document routes', () => {
  it('maps each command to its document route', () => {
    expect(exportDocumentUrl('export.customerProposal', { projectId: 'p1' })).toBe(
      '/projects/p1/proposal',
    )
    expect(exportDocumentUrl('export.sitePlan', { projectId: 'p1' })).toBe('/projects/p1/site-plan')
    expect(exportDocumentUrl('export.screenEnclosureQuote', { projectId: 'p1' })).toBe(
      '/projects/p1/screen-enclosure-quote',
    )
  })

  it('carries the construction page size', () => {
    expect(exportDocumentUrl('export.constructionPacket', { projectId: 'p1' })).toBe(
      '/projects/p1/construction?size=tabloid',
    )
    expect(
      exportDocumentUrl('export.constructionPacket', { projectId: 'p1', pageSize: 'letter' }),
    ).toBe('/projects/p1/construction?size=letter')
  })

  it('carries the screen RFQ pricing flags only when enabled', () => {
    expect(
      exportDocumentUrl('export.screenEnclosureQuote', {
        projectId: 'p1',
        showInternalPricing: true,
        showScreenScopeRetail: true,
      }),
    ).toBe('/projects/p1/screen-enclosure-quote?pricing=1&subtotal=1')
    expect(
      exportDocumentUrl('export.screenEnclosureQuote', {
        projectId: 'p1',
        showInternalPricing: false,
        showScreenScopeRetail: true,
      }),
    ).toBe('/projects/p1/screen-enclosure-quote?subtotal=1')
  })
})
