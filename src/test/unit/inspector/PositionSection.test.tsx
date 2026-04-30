import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShapeKind } from '@prisma/client'

vi.mock('@/lib/commands/dispatch', () => ({
  dispatch: vi.fn(async () => ({ ok: true, data: undefined })),
}))

import { dispatch } from '@/lib/commands/dispatch'
import { PositionSection } from '@/components/editor/shell/inspector/PositionSection'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'

const dispatchMock = vi.mocked(dispatch)

describe('PositionSection', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    useShapesStore.setState({ shapes: [] })
    useSelectionStore.setState({ selectedIds: [] })

    useShapesStore.getState().hydrate([
      {
        id: 'pool-1',
        kind: ShapeKind.RECTANGLE_POOL,
        x: 120, // 10 ft
        y: 240, // 20 ft
        width: 25 * 12,
        height: 12 * 12,
        rotation: 0,
        zIndex: 1,
        locked: false,
        hidden: false,
        depthShallow: 3,
        depthDeep: 5,
      },
    ])
    useSelectionStore.getState().select('pool-1')
  })

  it('renders position fields for the selected shape', () => {
    render(<PositionSection />)
    const xInput = screen.getByDisplayValue('10.0')
    const yInput = screen.getByDisplayValue('20.0')
    expect(xInput).toBeInTheDocument()
    expect(yInput).toBeInTheDocument()
  })

  it('dispatches move.shape with feet→inches conversion on blur', () => {
    render(<PositionSection />)
    const xInput = screen.getByDisplayValue('10.0') as HTMLInputElement
    fireEvent.change(xInput, { target: { value: '15' } })
    fireEvent.blur(xInput)
    expect(dispatchMock).toHaveBeenCalledTimes(1)
    expect(dispatchMock).toHaveBeenCalledWith('move.shape', {
      id: 'pool-1',
      x: 180, // 15 ft × 12
      y: 240, // unchanged
    })
  })

  it('does not dispatch when value is unchanged', () => {
    render(<PositionSection />)
    const xInput = screen.getByDisplayValue('10.0') as HTMLInputElement
    fireEvent.blur(xInput)
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('commits on Enter via blur', () => {
    render(<PositionSection />)
    const xInput = screen.getByDisplayValue('10.0') as HTMLInputElement
    fireEvent.change(xInput, { target: { value: '12' } })
    fireEvent.keyDown(xInput, { key: 'Enter' })
    fireEvent.blur(xInput)
    expect(dispatchMock).toHaveBeenCalledWith('move.shape', expect.objectContaining({ id: 'pool-1', x: 144 }))
  })

  it('renders empty state with no selection', () => {
    useSelectionStore.getState().clear()
    render(<PositionSection />)
    expect(screen.getByText('No selection')).toBeInTheDocument()
  })
})
