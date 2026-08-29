// What the person who typed 99999 is left looking at.
//
// The bound itself is covered in `src/test/unit/commands/bounds.test.ts`. This
// is the other half of the same defect: the inspector threw the dispatch result
// away (`void dispatch(...)`), so a refusal produced no toast, no revert, and a
// field still reading 99999 next to a pool that had not moved. Silence and
// success looked identical, which is the reason the reviewer believed the app
// had accepted it.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ShapeKind } from '@prisma/client'

vi.mock('@/lib/commands/dispatch', () => ({
  dispatch: vi.fn(async () => ({ ok: true, data: undefined })),
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }))

import { dispatch } from '@/lib/commands/dispatch'
import { GeometrySection } from '@/components/editor/shell/inspector/GeometrySection'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'

const dispatchMock = vi.mocked(dispatch)

const REFUSAL =
  '“Update pool geometry” could not run. Pool length must be between 1 and 400 feet. You entered 99,999. Nothing was changed.'

describe('GeometrySection', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    dispatchMock.mockResolvedValue({ ok: true, data: undefined })
    toastError.mockClear()
    useShapesStore.setState({ shapes: [] })
    useSelectionStore.setState({ selectedIds: [] })
    useShapesStore.getState().hydrate([
      {
        id: 'pool-1',
        kind: ShapeKind.RECTANGLE_POOL,
        x: 0,
        y: 0,
        width: 30 * 12,
        height: 14 * 12,
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

  it('sends an in-range length as feet', async () => {
    render(<GeometrySection />)
    const length = screen.getByDisplayValue('30.0')
    fireEvent.change(length, { target: { value: '32' } })
    fireEvent.blur(length)

    await waitFor(() => expect(dispatchMock).toHaveBeenCalledTimes(1))
    expect(dispatchMock.mock.calls[0]?.[0]).toBe('pool.geometry.update')
    expect(dispatchMock.mock.calls[0]?.[1]).toMatchObject({ id: 'pool-1', lengthFt: 32 })
  })

  it('shows the refusal and puts the field back', async () => {
    dispatchMock.mockResolvedValue({ ok: false, error: REFUSAL })
    render(<GeometrySection />)

    const length = screen.getByDisplayValue('30.0')
    fireEvent.change(length, { target: { value: '99999' } })
    fireEvent.blur(length)

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(REFUSAL))
    // Back to the pool's real length, not the number that was refused.
    await waitFor(() => expect((length as HTMLInputElement).value).toBe('30.0'))
  })

  it('tells the control the same range the command enforces', () => {
    render(<GeometrySection />)
    const length = screen.getByDisplayValue('30.0') as HTMLInputElement
    expect(length.min).toBe('1')
    expect(length.max).toBe('400')

    const shallow = screen.getByDisplayValue('3.0') as HTMLInputElement
    expect(shallow.min).toBe('0.5')
    expect(shallow.max).toBe('20')
  })

  it('shows average depth and slope as readouts, since nothing sets them', () => {
    // Both were editable inputs that dispatched fields the client handler does
    // not read, so typing into either did nothing and said nothing.
    render(<GeometrySection />)
    // avg of 3 and 5
    expect(screen.getByText('4.0')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('4.0')).toBeNull()
  })
})
