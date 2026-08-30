import { describe, expect, it, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'

import { LiveSessionBorder } from '@/components/editor/LiveSessionBorder'
import { useVoiceLiveStore } from '@/modules/voice/client/liveStore'

describe('LiveSessionBorder', () => {
  beforeEach(() => {
    useVoiceLiveStore.setState({ status: 'unavailable' })
  })

  // Same rule as Marco himself: the border stands over the drawing and must
  // never cost a click.
  it('never takes a pointer event', () => {
    const { container } = render(<LiveSessionBorder />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('pointer-events-none')
  })

  it('is idle until the session is live', () => {
    const { container } = render(<LiveSessionBorder />)
    expect(container.querySelector('[data-live-border="idle"]')).not.toBeNull()
  })

  it('goes live with the session and retracts with it', () => {
    const { container } = render(<LiveSessionBorder />)
    act(() => useVoiceLiveStore.setState({ status: 'live' }))
    expect(container.querySelector('[data-live-border="live"]')).not.toBeNull()
    act(() => useVoiceLiveStore.setState({ status: 'idle' }))
    expect(container.querySelector('[data-live-border="idle"]')).not.toBeNull()
  })

  // 'starting' is not live: the line draws when Marco is actually listening,
  // not while the microphone permission dialog is still up.
  it('does not light up while the session is only starting', () => {
    const { container } = render(<LiveSessionBorder />)
    act(() => useVoiceLiveStore.setState({ status: 'starting' }))
    expect(container.querySelector('[data-live-border="idle"]')).not.toBeNull()
  })
})
