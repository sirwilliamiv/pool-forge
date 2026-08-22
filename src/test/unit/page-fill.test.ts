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
  it('sets a text field by its label', async () => {
    const doc = render(`<label for="n">Project name</label><input id="n" value="" />`)
    const [result] = await fillPage([{ label: 'Project name', value: 'Whitfield residence' }], doc)
    expect(result?.filled).toBe(true)
    expect(doc.querySelector<HTMLInputElement>('#n')?.value).toBe('Whitfield residence')
  })

  it('fires an input event so React sees the change', async () => {
    // Assigning .value directly does not notify React: it tracks the previous
    // value on the node, so the field would show the new text while form state
    // still held the old one.
    const doc = render(`<label for="n">Name</label><input id="n" />`)
    const input = doc.querySelector<HTMLInputElement>('#n')!
    const seen = vi.fn()
    input.addEventListener('input', seen)

    await fillPage([{ label: 'Name', value: 'Jane' }], doc)
    expect(seen).toHaveBeenCalled()
  })

  it('matches a label the way a person would say it', async () => {
    // "length" has to find "Pool length (feet)".
    const doc = render(`<label for="l">Pool length (feet)</label><input id="l" />`)
    expect((await fillPage([{ label: 'length', value: '32' }], doc))[0]?.filled).toBe(true)
  })

  it('ticks a checkbox from yes', async () => {
    const doc = render(`<label for="h">Heater</label><input id="h" type="checkbox" />`)
    await fillPage([{ label: 'Heater', value: 'yes' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#h')?.checked).toBe(true)
  })

  it('unticks a checkbox from no, and leaves it alone if already right', async () => {
    const doc = render(`<label for="h">Heater</label><input id="h" type="checkbox" checked />`)
    await fillPage([{ label: 'Heater', value: 'no' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#h')?.checked).toBe(false)
    await fillPage([{ label: 'Heater', value: 'no' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#h')?.checked).toBe(false)
  })

  it('picks a dropdown option and lists the choices when there is no match', async () => {
    const doc = render(`
      <label for="s">Status</label>
      <select id="s"><option value="d">Draft</option><option value="a">Approved</option></select>
    `)
    expect((await fillPage([{ label: 'Status', value: 'Approved' }], doc))[0]?.filled).toBe(true)
    expect(doc.querySelector<HTMLSelectElement>('#s')?.value).toBe('a')

    const miss = (await fillPage([{ label: 'Status', value: 'Shipped' }], doc))[0]
    expect(miss?.filled).toBe(false)
    // Naming the choices is what lets the agent offer them instead of guessing.
    expect(miss?.reason).toContain('Draft')
  })

  it('never fills a password field', async () => {
    const doc = render(`<label for="p">Password</label><input id="p" type="password" />`)
    const [result] = await fillPage([{ label: 'Password', value: 'hunter2' }], doc)
    expect(result?.filled).toBe(false)
    expect(doc.querySelector<HTMLInputElement>('#p')?.value).toBe('')
  })

  it('refuses a disabled or read-only field instead of pretending', async () => {
    const doc = render(`
      <label for="a">Locked</label><input id="a" disabled />
      <label for="b">Computed</label><input id="b" readonly />
    `)
    const results = await fillPage(
      [
        { label: 'Locked', value: 'x' },
        { label: 'Computed', value: 'y' },
      ],
      doc,
    )
    expect(results.every(result => !result.filled)).toBe(true)
  })

  it('reports each field separately rather than failing the whole call', async () => {
    // Filling four of five is a useful outcome the agent can describe; an
    // all-or-nothing failure leaves the user not knowing what landed.
    const doc = render(`<label for="n">Name</label><input id="n" />`)
    const results = await fillPage(
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

  it('reports what the field holds afterwards', async () => {
    // So the agent confirms what it actually did rather than what it intended.
    const doc = render(`<label for="n">Name</label><input id="n" />`)
    expect((await fillPage([{ label: 'Name', value: '  Jane  ' }], doc))[0]?.value).toBe('Jane')
  })
})

describe('dates, numbers and radio groups', () => {
  it('turns a spoken date into what the input accepts', async () => {
    // A type="date" field takes yyyy-mm-dd and nothing else. Given "March 4th"
    // it stays empty and reports no error, so the agent would claim it set a
    // date that was never set.
    const doc = render(`<label for="d">Proposal expires</label><input id="d" type="date" />`)
    await fillPage([{ label: 'Proposal expires', value: 'March 4 2027' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#d')?.value).toBe('2027-03-04')
  })

  it('accepts a date already in machine format', async () => {
    const doc = render(`<label for="d">Expires</label><input id="d" type="date" />`)
    await fillPage([{ label: 'Expires', value: '2027-03-04' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#d')?.value).toBe('2027-03-04')
  })

  it('refuses a date it cannot read rather than guessing one', async () => {
    // A wrong expiry on a proposal is worse than a question.
    const doc = render(`<label for="d">Expires</label><input id="d" type="date" />`)
    const [result] = await fillPage([{ label: 'Expires', value: 'sometime next spring' }], doc)
    expect(result?.filled).toBe(false)
    expect(doc.querySelector<HTMLInputElement>('#d')?.value).toBe('')
  })

  it('strips the words around a number', async () => {
    // "thirty two feet" arrives as text around a number, and a number input
    // rejects anything else outright and stays silently empty.
    const doc = render(`<label for="n">Length</label><input id="n" type="number" />`)
    await fillPage([{ label: 'Length', value: '32 feet' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#n')?.value).toBe('32')
  })

  it('sets an email field', async () => {
    const doc = render(`<label for="e">Email</label><input id="e" type="email" />`)
    await fillPage([{ label: 'Email', value: 'jane@whitfield.test' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#e')?.value).toBe('jane@whitfield.test')
  })

  it('picks a radio by the group name and the option name', async () => {
    // "Set status to approved", not "tick the approved radio button".
    const doc = render(`
      <fieldset><legend>Status</legend>
        <label for="r1">Draft</label><input id="r1" type="radio" name="status" value="draft" />
        <label for="r2">Approved</label><input id="r2" type="radio" name="status" value="approved" />
      </fieldset>
    `)
    expect((await fillPage([{ label: 'Status', value: 'Approved' }], doc))[0]?.filled).toBe(true)
    expect(doc.querySelector<HTMLInputElement>('#r2')?.checked).toBe(true)
  })

  it('clears a field when given nothing', async () => {
    const doc = render(`<label for="n">Notes</label><input id="n" value="old" />`)
    await fillPage([{ label: 'Notes', value: '' }], doc)
    expect(doc.querySelector<HTMLInputElement>('#n')?.value).toBe('')
  })
})

describe('labels the way this app actually renders them', () => {
  // A real project page offered twenty-six inputs of which three were
  // addressable. The labels were all there — as siblings with no `for`, which
  // is what Shadcn's Label and Input produce together — and every standard
  // lookup missed them.
  const SHADCN = `
    <div class="space-y-2"><label>Salesperson</label><input class="input" /></div>
    <div class="space-y-2"><label>Designer</label><input class="input" /></div>
    <div class="space-y-2"><label>Proposal expires</label><input type="date" /></div>
  `

  it('finds a label that is a sibling with no htmlFor', async () => {
    const doc = render(SHADCN)
    const [result] = await fillPage([{ label: 'Salesperson', value: 'Ray Mitchell' }], doc)
    expect(result?.filled).toBe(true)
    expect(doc.querySelectorAll<HTMLInputElement>('.input')[0]?.value).toBe('Ray Mitchell')
  })

  it('does not put the value in the field next door', async () => {
    // The failure worth guarding: filling the wrong box is silent, where an
    // unfound field is a question the agent can ask.
    const doc = render(SHADCN)
    await fillPage([{ label: 'Designer', value: 'Jane' }], doc)
    const inputs = doc.querySelectorAll<HTMLInputElement>('.input')
    expect(inputs[0]?.value).toBe('')
    expect(inputs[1]?.value).toBe('Jane')
  })

  it('fills several sibling-labelled fields in one call', async () => {
    const doc = render(SHADCN)
    const results = await fillPage(
      [
        { label: 'Salesperson', value: 'Ray' },
        { label: 'Designer', value: 'Jane' },
        { label: 'Proposal expires', value: 'March 4 2027' },
      ],
      doc,
    )
    expect(results.every(result => result.filled)).toBe(true)
    expect(doc.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('2027-03-04')
  })
})
