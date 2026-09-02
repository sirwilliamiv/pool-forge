/** @vitest-environment jsdom */

// The project page saves as you type.
//
// The old ProjectForm carried these contracts and the detail redesign keeps
// them: autosave through the `project.update` command with a debounce, no
// write on hydration, a pending edit flushed on unmount, and each equipment
// question asked exactly once. These assert the behaviour, not the layout, so
// they hold across every `?layout=` variant — the sections and the save hook
// are the same instances everywhere.

import * as React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { EquipmentSection, PoolSection } from '@/components/project/detail/FormSections'
import { TextField } from '@/components/project/detail/fields'
import { useProjectSave } from '@/components/project/detail/useProjectSave'
import type { ProjectDetailFields } from '@/components/project/detail/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/commands/dispatch', () => ({
  dispatch: vi.fn(async () => ({ ok: true, data: { savedAt: 'now' } })),
}))

import { dispatch } from '@/lib/commands/dispatch'

const dispatchMock = vi.mocked(dispatch)

const initial: ProjectDetailFields = {
  name: 'Before',
  salesperson: '',
  designer: '',
  proposalExpiresAt: '',
  internalNotes: '',
  jurisdiction: '',
  parcelId: '',
  siteAddress: '',
  sitePlaceId: null,
  latitude: null,
  longitude: null,
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  billingAddress: '',
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

/** The page's editable surface, minus layout: name field + the spec sections. */
function Harness({
  values,
  depth,
}: {
  values: ProjectDetailFields
  depth: { shallowFt: number; deepFt: number } | null
}) {
  const save = useProjectSave('p1', values, 'auto')
  return (
    <>
      <TextField id="project-name" label="Name" value={save.form.name} onChange={(v) => save.update('name', v)} />
      <PoolSection save={save} depth={depth} projectId="p1" />
      <EquipmentSection save={save} />
    </>
  )
}

function lastSavedFields(): ProjectDetailFields {
  const call = dispatchMock.mock.calls.at(-1)
  expect(call?.[0]).toBe('project.update')
  return (call?.[1] as { fields: ProjectDetailFields }).fields
}

beforeEach(() => {
  dispatchMock.mockClear()
})

function setup(overrides: Partial<ProjectDetailFields> = {}, depth: { shallowFt: number; deepFt: number } | null = null) {
  return render(<Harness values={{ ...initial, ...overrides }} depth={depth} />)
}

describe('project page autosave', () => {
  it('saves a typed name without pressing Save', async () => {
    setup()
    const nameField = screen.getByDisplayValue('Before')
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'After')

    // Waits for the value to settle rather than for the first write. A long
    // pause mid-word makes the debounce fire on a half-typed name, which is
    // correct — it saves again when the rest arrives.
    await waitFor(() => expect(lastSavedFields().name).toBe('After'), { timeout: 5_000 })
  })

  it('does not save on mount', async () => {
    // Hydration is not an edit. Writing on render would touch every project a
    // user merely opened.
    setup()
    await new Promise(resolve => setTimeout(resolve, 1_500))
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('coalesces a burst of typing into one save', async () => {
    // A write per keystroke would be an audit row per keystroke.
    setup()
    await userEvent.type(screen.getByDisplayValue('Before'), 'xyz')
    await waitFor(() => expect(dispatchMock).toHaveBeenCalled(), { timeout: 4_000 })
    expect(dispatchMock.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('flushes a pending edit when the page goes away', async () => {
    // Leaving during the debounce window is exactly when someone types a name
    // and immediately clicks away.
    const view = setup()
    await userEvent.type(screen.getByDisplayValue('Before'), '!')
    view.unmount()
    await waitFor(() => expect(dispatchMock).toHaveBeenCalled(), { timeout: 2_000 })
  })
})

// The form asked about the heater twice: a "Heater selection" text box that
// changed no price, and an "Include heater" checkbox that changed all of
// price, line item, and validation. The spec box is subordinate to the
// selection: it collapses until the selection is on, and turning the
// selection off takes the spec with it.
describe('project page asks each question once', () => {
  it('does not let a heater be specced without being sold', async () => {
    setup({ heaterSelected: false }, { shallowFt: 3, deepFt: 5 })
    // Collapsed, not greyed out: an unticked heater has no model box at all.
    expect(screen.queryByLabelText('Heater model or fuel')).toBeNull()

    await userEvent.click(screen.getByLabelText('Include heater'))
    expect(screen.getByLabelText('Heater model or fuel')).toBeEnabled()
  })

  it('takes the spec away with the selection it described', async () => {
    setup(
      { heaterSelected: true, heaterSelection: 'Pentair MasterTemp 400' },
      { shallowFt: 3, deepFt: 5 },
    )

    await userEvent.click(screen.getByLabelText('Include heater'))

    await waitFor(
      () => {
        const values = lastSavedFields()
        expect(values.heaterSelected).toBe(false)
        expect(values.heaterSelection).toBe('')
      },
      { timeout: 5_000 },
    )
  })

  it('writes one sanitization answer to both the price and the printed row', async () => {
    setup()

    await userEvent.click(screen.getByLabelText('Sanitization'))
    await userEvent.click(await screen.findByRole('option', { name: 'Salt system' }))

    await waitFor(
      () => {
        const values = lastSavedFields()
        // The flag is what prices it; the string is what the proposal prints.
        // Neither can now be set without the other.
        expect(values.saltSystemSelected).toBe(true)
        expect(values.sanitizationPackage).toBe('Salt system')
      },
      { timeout: 5_000 },
    )
  })

  it('offers no second way to answer the heater, salt or screen question', () => {
    const view = setup({ heaterSelected: true, screenSelected: true, lightingQuantity: 2 })
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
    const view = setup({}, { shallowFt: 3, deepFt: 5 })
    const labels = [...view.container.querySelectorAll('label')].map((l) => l.textContent?.trim())
    expect(labels).not.toContain('Depth (shallow)')
    expect(labels).not.toContain('Depth (deep)')

    expect(within(view.container).getByText(/3 ft shallow \/ 5 ft deep/)).toBeInTheDocument()
  })
})
