/** @vitest-environment jsdom */

// Every control on the project page has a name a person and a machine can read.
//
// It did not. All 26 inputs and selects reported `id=""`, `name=""` and
// `aria-label=null`, with no `<label for>` anywhere: clicking a label focused
// nothing, a screen reader announced nothing, and the browser could not
// autofill the customer name/email/phone/address block. The login page next
// door got this right, so it was inconsistency rather than ignorance.
//
// This sweeps the whole page rather than checking a sample, because the failure
// mode is a new field added without a label, not the existing ones regressing.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProjectForm } from '@/components/project/ProjectForm'
import { ShareProposalCard } from '@/components/project/ShareProposalCard'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/projects/share', () => ({
  shareProject: vi.fn(async () => ({ ok: true, token: 'tok' })),
  unshareProject: vi.fn(async () => ({ ok: true })),
}))

const initial = {
  name: 'Riverside',
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
  interiorFinish: '',
  equipmentPackage: '',
  sanitizationPackage: '',
  heaterSelection: '',
  lightingSelection: '',
  deckMaterial: '',
  copingMaterial: '',
  screenOption: '',
  heaterSelected: true,
  saltSystemSelected: false,
  screenSelected: true,
  lightingQuantity: 2,
}

function renderPage() {
  return render(
    <>
      <ShareProposalCard projectId="p1" initialToken="tok" accepted={null} />
      <ProjectForm
        projectId="p1"
        initial={initial}
        depth={{ shallowFt: 3, deepFt: 5 }}
        saveAction={vi.fn(async () => ({ ok: true }))}
      />
    </>,
  )
}

/**
 * Enough of the accessible-name algorithm to catch the failure that shipped:
 * `aria-label`, `aria-labelledby`, `<label for>`, and a wrapping `<label>`.
 * Written out rather than imported so the test states what it requires.
 */
function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) return aria.trim()

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
    if (text) return text
  }

  if (el.id) {
    const label = el.ownerDocument.querySelector(`label[for="${el.id}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim()
  }

  const wrapping = el.closest('label')
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim()

  return ''
}

/** The controls a user can reach. Radix's mirrored natives are aria-hidden. */
function visibleControls(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('input, select, textarea, [role="combobox"]')].filter(
    (el) => !el.closest('[aria-hidden="true"]'),
  )
}

describe('project page form controls', () => {
  it('gives every control an accessible name', () => {
    const { container } = renderPage()
    const controls = visibleControls(container)

    // A guard on the guard: if the page ever renders no controls, an empty
    // sweep would pass while asserting nothing.
    expect(controls.length).toBeGreaterThanOrEqual(15)

    const unnamed = controls
      .filter((el) => accessibleName(el) === '')
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || '(no id)'}`)

    expect(unnamed).toEqual([])
  })

  it('gives every control an id, so a label can point at it', () => {
    const { container } = renderPage()
    const idless = visibleControls(container)
      .filter((el) => !el.id)
      .map((el) => `${el.tagName.toLowerCase()}[${accessibleName(el)}]`)

    expect(idless).toEqual([])
  })

  it('names every control that carries a value, so autofill and a form post work', () => {
    // Includes the natives Radix mirrors behind its checkbox and select
    // triggers: those are the elements a browser reads and a form submits.
    const { container } = renderPage()
    const nameless = [...container.querySelectorAll<HTMLElement>('input, select, textarea')]
      .filter((el) => !el.getAttribute('name'))
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || '(no id)'}`)

    expect(nameless).toEqual([])
  })

  it('lets the browser fill the customer block', () => {
    renderPage()
    // The four fields an address book knows about, with the tokens it looks for.
    expect(screen.getByLabelText('Name', { selector: '#customer-name' })).toHaveAttribute(
      'autocomplete',
      'name',
    )
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Phone')).toHaveAttribute('autocomplete', 'tel')
    expect(screen.getByLabelText('Job address')).toHaveAttribute('autocomplete', 'street-address')
  })

  it('focuses the field when its label is clicked', async () => {
    const { container } = renderPage()
    const label = container.querySelector('label[for="customer-email"]')
    expect(label).not.toBeNull()

    await userEvent.click(label as HTMLElement)
    expect(document.activeElement).toBe(container.querySelector('#customer-email'))
  })
})
