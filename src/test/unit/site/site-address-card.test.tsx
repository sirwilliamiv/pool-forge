/** @vitest-environment jsdom */

// The address field's confirm step.
//
// Picking a suggestion used to dispatch `site.address.set` on the spot, which
// was one stray click away from repointing the drawing's satellite backdrop
// and deleting the imported building. Picking now only proposes: it fills the
// input and reveals a "Set as project address" button, and nothing is written
// until that button (or Enter while it shows) is pressed.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SiteAddressCard } from '@/components/project/SiteAddressCard'
import { dispatch } from '@/lib/commands/dispatch'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/commands/dispatch', () => ({ dispatch: vi.fn(async () => ({ ok: true, data: {} })) }))

const dispatchMock = vi.mocked(dispatch)

const CONFIRM_LABEL = 'Set as project address'

const SUGGESTIONS = [
  { placeId: 'place-1', description: '4128 Maple St, Windermere, FL, USA' },
  { placeId: 'place-2', description: '4128 Maple Ave, Orlando, FL, USA' },
]

function stubAutocomplete(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: SUGGESTIONS }),
    })),
  )
}

function setup(initialAddress: string | null = null) {
  stubAutocomplete()
  return render(<SiteAddressCard projectId="p1" initialAddress={initialAddress} />)
}

async function typeAndOpen(text = '4128 Maple'): Promise<void> {
  await userEvent.type(screen.getByLabelText('Address'), text)
  await screen.findByRole('option', { name: SUGGESTIONS[0]!.description })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SiteAddressCard confirm flow', () => {
  it('picking a suggestion fills the input and reveals the confirm button without dispatching', async () => {
    setup()
    await typeAndOpen()

    await userEvent.click(screen.getByRole('option', { name: SUGGESTIONS[0]!.description }))

    expect(dispatchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Address')).toHaveValue(SUGGESTIONS[0]!.description)
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toBeInTheDocument()
  })

  it('clicking the confirm button dispatches site.address.set and hides the button', async () => {
    setup()
    await typeAndOpen()
    await userEvent.click(screen.getByRole('option', { name: SUGGESTIONS[0]!.description }))

    await userEvent.click(screen.getByRole('button', { name: CONFIRM_LABEL }))

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith('site.address.set', {
        projectId: 'p1',
        placeId: 'place-1',
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: CONFIRM_LABEL })).not.toBeInTheDocument()
    })
    expect(screen.getByText(/Saved\. Import site is now available/)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('typing again after picking hides the button until a new suggestion is picked', async () => {
    setup()
    await typeAndOpen()
    await userEvent.click(screen.getByRole('option', { name: SUGGESTIONS[0]!.description }))
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Address'), ' apt 2')
    expect(screen.queryByRole('button', { name: CONFIRM_LABEL })).not.toBeInTheDocument()
    expect(dispatchMock).not.toHaveBeenCalled()

    // A fresh pick brings the button back.
    await screen.findByRole('option', { name: SUGGESTIONS[1]!.description })
    await userEvent.click(screen.getByRole('option', { name: SUGGESTIONS[1]!.description }))
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toBeInTheDocument()
  })

  it('Enter picks the highlighted suggestion, a second Enter confirms it', async () => {
    setup()
    await typeAndOpen()

    // First Enter: pick the highlighted (first) suggestion. No dispatch yet.
    await userEvent.keyboard('{Enter}')
    expect(dispatchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toBeInTheDocument()

    // Second Enter, while the confirm button shows: the confirm.
    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith('site.address.set', {
        projectId: 'p1',
        placeId: 'place-1',
      })
    })
    expect(dispatchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the pick on a failed confirm so it can be retried', async () => {
    setup()
    dispatchMock.mockResolvedValueOnce({ ok: false, error: 'That address could not be resolved.' })
    await typeAndOpen()
    await userEvent.click(screen.getByRole('option', { name: SUGGESTIONS[0]!.description }))

    await userEvent.click(screen.getByRole('button', { name: CONFIRM_LABEL }))

    await screen.findByText('That address could not be resolved.')
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})
