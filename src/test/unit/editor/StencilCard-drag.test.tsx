/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StencilCard } from '@/components/editor/shell/stencils/StencilCard'
import { STENCIL_DRAG_MIME } from '@/modules/editor/interactions/stencil-drag'
import { getStencil } from '@/modules/editor/stencils'

describe('StencilCard drag', () => {
  it('is draggable and writes the stencil payload at real size', () => {
    const stencil = getStencil('pool.rectangle')!
    render(<StencilCard stencil={stencil} onAdd={vi.fn()} />)
    const card = screen.getByRole('button', { name: /standard rectangle/i })
    expect(card).toHaveAttribute('draggable', 'true')
    const data = new Map<string, string>()
    fireEvent.dragStart(card, { dataTransfer: { setData: (k: string, v: string) => data.set(k, v), types: [], effectAllowed: 'none' } })
    expect(JSON.parse(data.get(STENCIL_DRAG_MIME)!)).toEqual({ source: 'catalog', id: 'pool.rectangle', widthIn: 360, heightIn: 168 })
  })
})
