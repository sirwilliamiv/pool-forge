/** @vitest-environment jsdom */

// The project form saves as you type.
//
// It did not, and the editor next door has autosaved from the start, so a name
// typed here and then navigated away from was simply lost — which reads as the
// save being broken when it was never asked to run.

import { render, screen, waitFor, within } from '@testing-library/react'
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
  jurisdiction: '',
  parcelId: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  customerNotes: '',
  poolType: '',
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
  const view = render(
    <ProjectForm projectId="p1" initial={initial} depth={null} saveAction={saveAction} />,
  )
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


// The form asked about the heater twice: a "Heater selection" text box that
// changed no price, no line item and no validation, and an "Include heater"
// checkbox that changed all three. Same for salt and the screen. A builder
// filling the detailed field and skipping the checkbox shipped a quote with no
// equipment on it.
//
// The spec box is now subordinate to the selection: it lives under it, it is
// dead until the selection is on, and turning the selection off takes the spec
// with it. These assert the behaviour, not the layout.
describe('ProjectForm asks each question once', () => {
  function renderWith(overrides: Partial<typeof initial> = {}) {
    const saveAction = vi.fn(async () => ({ ok: true }))
    const view = render(
      <ProjectForm
        projectId="p1"
        initial={{ ...initial, ...overrides }}
        depth={{ shallowFt: 3, deepFt: 5 }}
        saveAction={saveAction}
      />,
    )
    return { saveAction, view }
  }

  it('does not let a heater be specced without being sold', async () => {
    renderWith({ heaterSelected: false })
    expect(screen.getByLabelText('Heater model or fuel')).toBeDisabled()

    await userEvent.click(screen.getByLabelText('Include heater'))
    expect(screen.getByLabelText('Heater model or fuel')).toBeEnabled()
  })

  it('takes the spec away with the selection it described', async () => {
    const { saveAction } = renderWith({
      heaterSelected: true,
      heaterSelection: 'Pentair MasterTemp 400',
    })

    await userEvent.click(screen.getByLabelText('Include heater'))

    await waitFor(
      () => {
        const [, values] = saveAction.mock.calls.at(-1) as unknown as [string, typeof initial]
        expect(values.heaterSelected).toBe(false)
        expect(values.heaterSelection).toBe('')
      },
      { timeout: 5_000 },
    )
  })

  it('writes one sanitization answer to both the price and the printed row', async () => {
    const { saveAction } = renderWith()

    await userEvent.click(screen.getByLabelText('Sanitization'))
    await userEvent.click(await screen.findByRole('option', { name: 'Salt system' }))

    await waitFor(
      () => {
        const [, values] = saveAction.mock.calls.at(-1) as unknown as [string, typeof initial]
        // The flag is what prices it; the string is what the proposal prints.
        // Neither can now be set without the other.
        expect(values.saltSystemSelected).toBe(true)
        expect(values.sanitizationPackage).toBe('Salt system')
      },
      { timeout: 5_000 },
    )
  })

  it('offers no second way to answer the heater, salt or screen question', () => {
    const { view } = renderWith()
    const labels = [...view.container.querySelectorAll('label')].map((l) => l.textContent?.trim())

    // The old free-text twins. Their replacements are named for what they are:
    // "Heater model or fuel", "Mesh and cage spec", "Fixture model".
    expect(labels).not.toContain('Heater selection')
    expect(labels).not.toContain('Sanitization package')
    expect(labels).not.toContain('Screen option')
    expect(labels).not.toContain('Lighting selection')
    expect(labels).not.toContain('Include salt system')
  })

  it('shows the drawing’s depth and offers no box to contradict it', () => {
    const { view } = renderWith()
    const labels = [...view.container.querySelectorAll('label')].map((l) => l.textContent?.trim())
    expect(labels).not.toContain('Depth (shallow)')
    expect(labels).not.toContain('Depth (deep)')

    expect(within(view.container).getByText(/3 ft shallow \/ 5 ft deep/)).toBeInTheDocument()
  })
})
