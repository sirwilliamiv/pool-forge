/** @vitest-environment jsdom */

// The project form saves as you type.
//
// It did not, and the editor next door has autosaved from the start, so a name
// typed here and then navigated away from was simply lost — which reads as the
// save being broken when it was never asked to run.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProjectForm } from '@/components/project/ProjectForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const initial = {
  name: 'Before',
  salesperson: '',
  designer: '',
  status: 'DRAFT' as const,
  proposalExpiresAt: '',
  internalNotes: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  customerNotes: '',
  poolType: '',
  depthShallow: '',
  depthDeep: '',
  interiorFinish: '',
  equipmentPackage: '',
  sanitizationPackage: '',
  heaterSelection: '',
  lightingSelection: '',
  deckMaterial: '',
  copingMaterial: '',
  screenOption: '',
  heaterSelected: false,
  saltSystemSelected: false,
  screenSelected: false,
  lightingQuantity: 0,
}

function setup() {
  const saveAction = vi.fn(async () => ({ ok: true }))
  const view = render(<ProjectForm projectId="p1" initial={initial} saveAction={saveAction} />)
  return { saveAction, view }
}

describe('ProjectForm autosave', () => {
  it('saves a typed name without pressing Save', async () => {
    const { saveAction } = setup()
    const nameField = screen.getByDisplayValue('Before')
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'After')

    // Waits for the value to settle rather than for the first write. A long
    // pause mid-word makes the debounce fire on a half-typed name, which is
    // correct — it saves again when the rest arrives.
    await waitFor(
      () => {
        const [, values] = saveAction.mock.calls.at(-1) as unknown as [string, typeof initial]
        expect(values.name).toBe('After')
      },
      { timeout: 5_000 },
    )
  })

  it('does not save on mount', async () => {
    // Hydration is not an edit. Writing on render would touch every project a
    // user merely opened.
    const { saveAction } = setup()
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(saveAction).not.toHaveBeenCalled()
  })

  it('coalesces a burst of typing into one save', async () => {
    // A write per keystroke would be a write per keystroke.
    const { saveAction } = setup()
    await userEvent.type(screen.getByDisplayValue('Before'), 'xyz')
    await waitFor(() => expect(saveAction).toHaveBeenCalled(), { timeout: 4_000 })
    expect(saveAction.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('flushes a pending edit when the form goes away', async () => {
    // Leaving during the debounce window is exactly when someone types a name
    // and immediately clicks away.
    const { saveAction, view } = setup()
    await userEvent.type(screen.getByDisplayValue('Before'), '!')
    view.unmount()
    await waitFor(() => expect(saveAction).toHaveBeenCalled(), { timeout: 2_000 })
  })
})
