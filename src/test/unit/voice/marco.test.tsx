import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { Marco } from '@/components/voice/Marco'
import { useGuideStore } from '@/modules/guide/store'

describe('Marco', () => {
  // The one rule. He stands over the drawing, and on this product the drawing
  // is the whole point, so he must never cost a click.
  it('never takes a pointer event', () => {
    const { container } = render(<Marco state="idle" />)
    const stage = container.firstElementChild as HTMLElement
    expect(stage.style.pointerEvents).toBe('none')
  })

  it('reserves exactly the space it was given', () => {
    const { container } = render(<Marco state="idle" size={120} />)
    const stage = container.firstElementChild as HTMLElement
    expect(stage.style.width).toBe('120px')
    expect(stage.style.height).toBe('120px')
  })

  // The character loads asynchronously and draws to canvas. If it cannot, the
  // voice session still has to work: he is decoration on a working feature.
  it('renders a stage even before the character has loaded', () => {
    const { container } = render(<Marco state="listening" />)
    expect(container.firstElementChild).not.toBeNull()
  })

  it('survives being unmounted while still loading', () => {
    const { unmount } = render(<Marco state="idle" />)
    expect(() => unmount()).not.toThrow()
  })
})

describe('guide store', () => {
  it('clearing empties the highlight list', () => {
    useGuideStore.getState().point(['tool.line', 'tool.curve'])
    useGuideStore.getState().clear()
    expect(useGuideStore.getState().highlighted).toEqual([])
  })
})
