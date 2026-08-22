/** @vitest-environment jsdom */

// Filling in what is on screen.
//
// It drives the real controls rather than writing to a store, so whatever
// validation and save behaviour the form already has applies unchanged. These
// pin the parts that decide whether the edit is real: React has to see it,
// labels have to match the way a person says them, and credentials are never
// touched.

import { describe, expect, it, vi } from 'vitest'

import { fillPage } from '@/modules/editor/page-fill'

function render(html: string): Document {
  document.body.innerHTML = `<main>${html}</main>`
  return document
}

describe('fillPage', () => {
  it('sets a text field by its label', () => {
    const doc = render(`<label for="n">Project name</label><input id="n" value="" />`)
    const [result] = fillPage([{ label: 'Project name', value: 'Whitfield residence' }], doc)
    expect(result?.filled).toBe(true)
    expect(doc.querySelector<HTMLInputElement>('#n')?.value).toBe('Whitfield residence')
  })

  it('fires an input event so React sees the change', () => {
    // Assigning .value directly does not notify React: it tracks the previous
    // value on the node, so the field would show the new text while form state
    // still held the old one.
    const doc = render(`<label for="n">Name</label><input id="n" />`)
    const input = doc.querySelector<HTMLInputElement>('#n')!
    const seen = vi.fn()
    input.addEventListener('input', seen)

    fillPage([{ label: 'Name', value: 'Jane' }], doc)
    expect(seen).toHaveBeenCalled()
  })

  it('matches a label the way a person would say it', () => {
    // "length" has to find "Pool length (feet)".
    const doc = render(`<label for="l">Pool length (feet)</label><input id="l" />`)
    expect(fillPage([{ label: 'length', value: '32' }], doc)[0]?.filled).toBe(true)
  })

  it('ticks a checkbox from yes', () => {
    const doc = render(`<label for="h">Heater</label><input id="h" type="checkbox" />`)
    fillPage([{ label: 'Heater', value: 'yes' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#h')?.checked).toBe(true)
  })

  it('unticks a checkbox from no, and leaves it alone if already right', () => {
    const doc = render(`<label for="h">Heater</label><input id="h" type="checkbox" checked />`)
    fillPage([{ label: 'Heater', value: 'no' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#h')?.checked).toBe(false)
    fillPage([{ label: 'Heater', value: 'no' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#h')?.checked).toBe(false)
  })

  it('picks a dropdown option and lists the choices when there is no match', () => {
    const doc = render(`
      <label for="s">Status</label>
      <select id="s"><option value="d">Draft</option><option value="a">Approved</option></select>
    `)
    expect(fillPage([{ label: 'Status', value: 'Approved' }], doc)[0]?.filled).toBe(true)
    expect(doc.querySelector<HTMLSelectElement>('#s')?.value).toBe('a')

    const miss = fillPage([{ label: 'Status', value: 'Shipped' }], doc)[0]
    expect(miss?.filled).toBe(false)
    // Naming the choices is what lets the agent offer them instead of guessing.
    expect(miss?.reason).toContain('Draft')
  })

  it('never fills a password field', () => {
    const doc = render(`<label for="p">Password</label><input id="p" type="password" />`)
    const [result] = fillPage([{ label: 'Password', value: 'hunter2' }], doc)
    expect(result?.filled).toBe(false)
    expect(doc.querySelector<HTMLInputElement>('#p')?.value).toBe('')
  })

  it('refuses a disabled or read-only field instead of pretending', () => {
    const doc = render(`
      <label for="a">Locked</label><input id="a" disabled />
      <label for="b">Computed</label><input id="b" readonly />
    `)
    const results = fillPage(
      [
        { label: 'Locked', value: 'x' },
        { label: 'Computed', value: 'y' },
      ],
      doc,
    )
    expect(results.every(result => !result.filled)).toBe(true)
  })

  it('reports each field separately rather than failing the whole call', () => {
    // Filling four of five is a useful outcome the agent can describe; an
    // all-or-nothing failure leaves the user not knowing what landed.
    const doc = render(`<label for="n">Name</label><input id="n" />`)
    const results = fillPage(
      [
        { label: 'Name', value: 'Jane' },
        { label: 'Nonexistent field', value: 'x' },
      ],
      doc,
    )
    expect(results[0]?.filled).toBe(true)
    expect(results[1]?.filled).toBe(false)
    expect(results[1]?.reason).toMatch(/no field/i)
  })

  it('reports what the field holds afterwards', () => {
    // So the agent confirms what it actually did rather than what it intended.
    const doc = render(`<label for="n">Name</label><input id="n" />`)
    expect(fillPage([{ label: 'Name', value: '  Jane  ' }], doc)[0]?.value).toBe('Jane')
  })
})
