/** @vitest-environment jsdom */
import { ShapeKind, StencilCategory } from '@prisma/client'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn(async () => ({ ok: true, data: { stencils: [] } })) }))
import { LibraryGroup } from '@/components/editor/shell/stencils/LibraryGroup'
import { useLibraryStore } from '@/modules/editor/state/libraryStore'
import { STENCIL_DRAG_MIME } from '@/modules/editor/interactions/stencil-drag'

const kidney = {
  id: 'clx1', name: 'Kidney 11', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL, widthIn: 324, heightIn: 171,
  thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', fill: '#00ffff', stroke: '#000000', sourceFile: 'Pool.vss', updatedAt: '2026-10-16T00:00:00.000Z',
}
const alarm = { ...kidney, id: 'clx2', name: 'Guard Alarm', category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH, widthIn: 12, heightIn: 12 }

describe('LibraryGroup', () => {
  beforeEach(() => useLibraryStore.setState({ stencils: [], loaded: true, loading: false, error: null }))

  it('shows the drop zone when the library is empty', () => {
    render(<LibraryGroup search="" onImportFile={vi.fn()} />)
    expect(screen.getByText(/drop a visio stencil/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /choose file/i })).toBeInTheDocument()
  })

  it('lists stencils with thumbnails and drags them as library stencils', () => {
    useLibraryStore.setState({ stencils: [kidney] })
    render(<LibraryGroup search="" onImportFile={vi.fn()} />)
    expect(screen.getByText('My library')).toBeInTheDocument()
    const card = screen.getByRole('button', { name: /kidney 11/i })
    expect(card.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    const data = new Map<string, string>()
    fireEvent.dragStart(card, { dataTransfer: { setData: (k: string, v: string) => data.set(k, v), types: [], effectAllowed: 'none' } })
    expect(JSON.parse(data.get(STENCIL_DRAG_MIME)!)).toMatchObject({ source: 'library', id: 'clx1', widthIn: 324, heightIn: 171 })
  })

  it('filters by the search box like the catalogue does', () => {
    useLibraryStore.setState({ stencils: [kidney, alarm] })
    render(<LibraryGroup search="alarm" onImportFile={vi.fn()} />)
    expect(screen.queryByText('Kidney 11')).toBeNull()
    expect(screen.getByText('Guard Alarm')).toBeInTheDocument()
  })
})

describe('Stencils panel file drop', () => {
  beforeEach(() => useLibraryStore.setState({ stencils: [], loaded: true, loading: false, error: null }))

  // Review Focus 5: a stencil card dragged across the panel on its way to the
  // canvas carries the stencil type and no Files. The panel must not light up
  // as if a file were coming, or it reads as an import that is about to happen.
  it('ignores a drag that carries only the stencil type', async () => {
    const { StencilGrid } = await import('@/components/editor/shell/stencils/StencilGrid')
    render(<StencilGrid search="" />)
    const zone = screen.getByTestId('stencil-drop-zone')
    const dataTransfer = { types: [STENCIL_DRAG_MIME, 'text/plain'], files: [], dropEffect: 'none' }
    fireEvent.dragEnter(zone, { dataTransfer })
    fireEvent.dragOver(zone, { dataTransfer })
    expect(zone).toHaveAttribute('data-dragging', 'false')
  })

  it('lights up for a file from the desktop', async () => {
    const { StencilGrid } = await import('@/components/editor/shell/stencils/StencilGrid')
    render(<StencilGrid search="" />)
    const zone = screen.getByTestId('stencil-drop-zone')
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [], dropEffect: 'none' } })
    expect(zone).toHaveAttribute('data-dragging', 'true')
  })
})
