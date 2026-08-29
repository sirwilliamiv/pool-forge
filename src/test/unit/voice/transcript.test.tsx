import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { VoiceTranscript } from '@/components/voice/VoiceTranscript'
import type { TranscriptLine } from '@/modules/voice/client/useVoiceSession'

function lines(count: number): TranscriptLine[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    role: i % 2 === 0 ? ('user' as const) : ('model' as const),
    text: `Line ${i}`,
  }))
}

describe('the voice transcript', () => {
  it('renders nothing when nothing has been said', () => {
    const { container } = render(<VoiceTranscript lines={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows what was said', () => {
    const { getByText } = render(<VoiceTranscript lines={lines(2)} />)
    expect(getByText('Line 0')).toBeTruthy()
    expect(getByText('Line 1')).toBeTruthy()
  })

  // The rule the whole component exists for. The editor is the product, and a
  // line of speech lying over a pool must not be a dead patch of canvas.
  it('never takes a click', () => {
    const { container } = render(<VoiceTranscript lines={lines(3)} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('pointer-events-none')
  })

  it('carries no background, border or shadow box', () => {
    const { container } = render(<VoiceTranscript lines={lines(3)} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).not.toMatch(/\bbg-/)
    expect(root.className).not.toMatch(/\bborder\b/)
    expect(root.className).not.toMatch(/\bshadow/)
  })

  it('fades out at the top rather than clipping or scrolling', () => {
    const { container } = render(<VoiceTranscript lines={lines(8)} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.maskImage || root.style.webkitMaskImage).toContain('transparent')
    // An overflow scroller would grow a scrollbar, which reads as a panel.
    expect(root.className).toContain('overflow-hidden')
  })
})
