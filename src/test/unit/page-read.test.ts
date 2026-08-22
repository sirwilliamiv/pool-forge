/** @vitest-environment jsdom */

// Reading whatever is on screen.
//
// The alternative was a hand-written reader per page, which covers the pages
// somebody remembered and silently fails on every page added afterwards. These
// pin the parts that decide whether the answer is right: structure survives, a
// long page is narrowed rather than truncated in silence, and nothing marked
// private is read out.

import { describe, expect, it } from 'vitest'

import { readPage } from '@/modules/editor/page-read'

function render(html: string): Document {
  document.body.innerHTML = `<main>${html}</main>`
  return document
}

describe('readPage', () => {
  it('keeps a table as rows with its header', () => {
    // A model handed "Salt cell 412 Heater 2150" as flat text will answer
    // confidently about which number belongs to which item, and be wrong.
    const doc = render(`
      <table>
        <thead><tr><th>Item</th><th>Price</th></tr></thead>
        <tbody>
          <tr><td>Salt cell</td><td>$412.00</td></tr>
          <tr><td>Heater</td><td>$2,150.00</td></tr>
        </tbody>
      </table>
    `)
    const reading = readPage(doc)
    expect(reading.tables).toHaveLength(1)
    expect(reading.tables[0]?.headers).toEqual(['Item', 'Price'])
    expect(reading.tables[0]?.rows).toEqual([
      ['Salt cell', '$412.00'],
      ['Heater', '$2,150.00'],
    ])
  })

  it('narrows a long page to what was asked about', () => {
    const rows = Array.from({ length: 120 }, (_, i) => `<tr><td>Item ${i}</td><td>$${i}</td></tr>`).join('')
    const doc = render(`<table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody>
      ${rows}<tr><td>Salt cell</td><td>$412.00</td></tr></tbody></table>`)

    const reading = readPage(doc, 'salt cell')
    const flat = reading.tables.flatMap(table => table.rows.map(row => row.join(' ')))
    expect(flat.some(row => row.includes('Salt cell'))).toBe(true)
    expect(flat.length).toBeLessThan(10)
  })

  it('says so when it could not read everything', () => {
    // Silently returning half a page is how a model answers "that is all of
    // them" when it is not.
    const rows = Array.from({ length: 400 }, (_, i) => `<tr><td>Item ${i}</td></tr>`).join('')
    const doc = render(`<table><tbody>${rows}</tbody></table>`)
    expect(readPage(doc).truncated).toBe(true)
  })

  it('pairs a heading with the text underneath it', () => {
    const doc = render(`
      <h2>Customer</h2><p>Jane Whitfield, 14 Oak Street.</p>
      <h2>Status</h2><p>Awaiting approval.</p>
    `)
    const reading = readPage(doc)
    expect(reading.headings).toEqual(['Customer', 'Status'])
    expect(reading.sections[0]?.text).toContain('Jane Whitfield')
    // The next heading ends the section: "Customer" must not swallow "Status".
    expect(reading.sections[0]?.text).not.toContain('Awaiting approval')
  })

  it('reads labelled values out of a form', () => {
    const doc = render(`
      <label for="len">Pool length</label><input id="len" value="32" />
      <label for="heat">Heater</label><input id="heat" type="checkbox" checked />
    `)
    const fields = readPage(doc).fields
    expect(fields).toContainEqual({ label: 'Pool length', value: '32' })
    expect(fields).toContainEqual({ label: 'Heater', value: 'yes' })
  })

  it('reads definition lists', () => {
    const doc = render(`<dl><dt>Salesperson</dt><dd>Ray</dd></dl>`)
    expect(readPage(doc).fields).toContainEqual({ label: 'Salesperson', value: 'Ray' })
  })

  it('never reads a password field', () => {
    const doc = render(`<label for="p">Password</label><input id="p" type="password" value="hunter2" />`)
    const reading = readPage(doc)
    expect(JSON.stringify(reading)).not.toContain('hunter2')
  })

  it('honours an explicit opt-out, including for everything inside it', () => {
    // The escape hatch for anything a page decides must not be read aloud.
    const doc = render(`
      <div data-voice-hide><h2>Internal margin</h2><p>Cost basis 41 percent.</p></div>
      <h2>Total</h2><p>Twelve thousand dollars.</p>
    `)
    const reading = readPage(doc)
    const text = JSON.stringify(reading)
    expect(text).not.toContain('Cost basis')
    expect(text).not.toContain('Internal margin')
    expect(text).toContain('Twelve thousand')
  })

  it('ignores scripts, styles and navigation chrome', () => {
    const doc = render(`
      <nav><a href="/dashboard">Dashboard</a></nav>
      <script>const secret = 'do-not-read'</script>
      <h2>Proposal</h2><p>Ready to send.</p>
    `)
    const text = JSON.stringify(readPage(doc))
    expect(text).not.toContain('do-not-read')
    expect(text).toContain('Ready to send')
  })

  it('reads the live document when given no root', () => {
    // How the command actually calls it: the page the user is looking at.
    render(`<h2>Proposal</h2><p>Ready to send.</p>`)
    expect(readPage().headings).toEqual(['Proposal'])
  })

  it('reads an empty page without throwing', () => {
    expect(readPage(render('')).headings).toEqual([])
  })
})
