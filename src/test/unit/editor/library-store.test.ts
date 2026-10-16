import { ShapeKind, StencilCategory } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn() }))
import { dispatch } from '@/lib/commands/dispatch'
import { libraryStencilsByCategory, useLibraryStore } from '@/modules/editor/state/libraryStore'
import type { OrgStencilSummary } from '@/modules/imports/visio/types'

const s = (name: string, category: StencilCategory): OrgStencilSummary => ({
  id: name, name, category, shapeKind: ShapeKind.SKETCH_PATH, widthIn: 12, heightIn: 12, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#000000', stroke: '#000000', sourceFile: 'Pool.vss', updatedAt: '2026-10-16T00:00:00.000Z',
})

describe('library store', () => {
  beforeEach(() => useLibraryStore.setState({ stencils: [], loaded: false, loading: false, error: null }))

  it('refresh dispatches the list command and stores the result', async () => {
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: true, data: { stencils: [s('A', StencilCategory.POOL_SHAPE)] } })
    await useLibraryStore.getState().refresh()
    expect(dispatch).toHaveBeenCalledWith('stencil.library.list', {})
    expect(useLibraryStore.getState().stencils.map(x => x.name)).toEqual(['A'])
    expect(useLibraryStore.getState().loaded).toBe(true)
  })

  it('keeps the old list and records the error when the list fails', async () => {
    useLibraryStore.setState({ stencils: [s('Old', StencilCategory.POOL_SHAPE)] })
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: false, error: 'nope' })
    await useLibraryStore.getState().refresh()
    expect(useLibraryStore.getState().stencils).toHaveLength(1)
    expect(useLibraryStore.getState().error).toBe('nope')
  })

  it('upsertMany replaces by id and remove drops', () => {
    useLibraryStore.setState({ stencils: [s('A', StencilCategory.POOL_SHAPE)] })
    useLibraryStore.getState().upsertMany([{ ...s('A', StencilCategory.POOL_SHAPE), widthIn: 99 }, s('B', StencilCategory.DECK_HOUSE)])
    expect(useLibraryStore.getState().stencils.map(x => [x.name, x.widthIn])).toEqual([['A', 99], ['B', 12]])
    useLibraryStore.getState().remove('A')
    expect(useLibraryStore.getState().stencils.map(x => x.name)).toEqual(['B'])
  })

  it('groups by category in panel order', () => {
    const groups = libraryStencilsByCategory([s('d', StencilCategory.DECK_HOUSE), s('p', StencilCategory.POOL_SHAPE)])
    expect([...groups.keys()]).toEqual([StencilCategory.POOL_SHAPE, StencilCategory.DECK_HOUSE])
  })
})
