/** @vitest-environment jsdom */
import { ShapeKind, StencilCategory } from '@prisma/client'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn() }))
import { dispatch } from '@/lib/commands/dispatch'
import { VisioImportDialog } from '@/components/editor/shell/stencils/VisioImportDialog'
import type { PreviewOutput } from '@/modules/imports/visio/types'

const preview: PreviewOutput = {
  importId: 'imp1', fileName: 'Pool.vss', scaleInchesPerInch: 96,
  candidates: [
    { index: 0, name: 'Standard Rectangle', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL, drawingWidthIn: 3.125, drawingHeightIn: 1.5, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#00ffff', stroke: '#000000' },
    { index: 1, name: 'Guard Alarm', category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH, drawingWidthIn: 0.125, drawingHeightIn: 0.125, ringCount: 1, thumbnailSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', fill: '#ffffff', stroke: '#000000' },
  ],
  skipped: [{ index: 2, name: 'SOB Text', reason: 'TEXT_ONLY' }],
}

describe('VisioImportDialog', () => {
  it('shows real-world sizes at the chosen scale and the skipped list with reasons', () => {
    render(<VisioImportDialog preview={preview} onClose={vi.fn()} onImported={vi.fn()} />)
    expect(screen.getByText("25' × 12'")).toBeInTheDocument()
    expect(screen.getByText('SOB Text')).toBeInTheDocument()
    expect(screen.getByText(/text only/i)).toBeInTheDocument()
  })

  it('commits only the ticked rows with the edited name and reports the count', async () => {
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: true, data: { created: 1, replaced: 0, stencils: [] } })
    const onImported = vi.fn()
    render(<VisioImportDialog preview={preview} onClose={vi.fn()} onImported={onImported} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /guard alarm/i }))
    fireEvent.change(screen.getByDisplayValue('Standard Rectangle'), { target: { value: 'Our rectangle' } })
    fireEvent.click(screen.getByRole('button', { name: /import 1 stencil$/i }))
    await waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(vi.mocked(dispatch).mock.calls[0]?.[0]).toBe('stencil.library.commit')
    expect(vi.mocked(dispatch).mock.calls[0]?.[1]).toEqual({
      importId: 'imp1', scaleInchesPerInch: 96,
      items: [
        { index: 0, include: true, name: 'Our rectangle', category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL },
        { index: 1, include: false, name: 'Guard Alarm', category: StencilCategory.CONSTRUCTION_SYMBOL, shapeKind: ShapeKind.SKETCH_PATH },
      ],
    })
    await waitFor(() => expect(onImported).toHaveBeenCalled())
  })

  it('shows the command error inline and keeps the dialog open', async () => {
    vi.mocked(dispatch).mockResolvedValueOnce({ ok: false, error: 'That preview expired. Drop the file again.' })
    const onClose = vi.fn()
    render(<VisioImportDialog preview={preview} onClose={onClose} onImported={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /import 2 stencils/i }))
    await waitFor(() => expect(screen.getByText(/preview expired/i)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })
})
