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

describe('Stencils panel catalogue toggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useLibraryStore.setState({ stencils: [kidney], loaded: true, loading: false, error: null, catalogHidden: false })
  })

  it('lists the Pool Forge stencils under their own heading with a Hide control', async () => {
    const { StencilGrid } = await import('@/components/editor/shell/stencils/StencilGrid')
    render(<StencilGrid search="" />)
    expect(screen.getByText('Pool Forge stencils')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Pool Forge stencils' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button', { name: /standard rectangle/i }).length).toBeGreaterThan(0)
  })

  // The store is what the command's client handler writes, so flipping it is
  // what the user sees after pressing Hide; the handler itself is covered in
  // handler-behaviour.test.ts.
  it('hides every built-in stencil and keeps the library when the catalogue is hidden', async () => {
    const { StencilGrid } = await import('@/components/editor/shell/stencils/StencilGrid')
    render(<StencilGrid search="" />)
    useLibraryStore.getState().setCatalogHidden(true)
    expect(await screen.findByText('Hidden. Only your library is listed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /standard rectangle/i })).toBeNull()
    expect(screen.getByRole('button', { name: /kidney 11/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Pool Forge stencils' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/no stencils match/i)).toBeNull()
  })

  it('sends the Hide press through the command registry', async () => {
    const { dispatch } = await import('@/lib/commands/dispatch')
    const { StencilGrid } = await import('@/components/editor/shell/stencils/StencilGrid')
    render(<StencilGrid search="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide Pool Forge stencils' }))
    expect(dispatch).toHaveBeenCalledWith('stencil.catalog.toggle', { hidden: true })
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
