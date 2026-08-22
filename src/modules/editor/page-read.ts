// Reading whatever is on the screen.
//
// The alternative was a hand-written reader per page, which covers the pages
// somebody remembered and silently fails on the rest — including every page
// added later. This reads the rendered document instead, so "what does this
// say" works on the price book, a proposal, a settings form and anything built
// next, without a line of per-page code.
//
// It extracts structure rather than a wall of text: headings, tables as rows,
// and label/value pairs. A model handed "Salt cell $412.00 Heater $2,150.00"
// with no shape to it will answer confidently and wrongly about which is which.

export interface PageTable {
  caption: string | null
  headers: string[]
  /** Capped rows; `truncatedRows` says how many were left out. */
  rows: string[][]
  truncatedRows: number
}

export interface PageSection {
  heading: string
  text: string
}

export interface PageReading {
  title: string
  url: string
  headings: string[]
  sections: PageSection[]
  fields: { label: string; value: string }[]
  tables: PageTable[]
  /** True when the reading was cut short by the size cap. */
  truncated: boolean
}

/** Chrome and anything a page marks private. Never read. */
const SKIP_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'nav',
  '[aria-hidden="true"]',
  '[data-voice-hide]',
  '[type="password"]',
].join(',')

const MAX_TABLE_ROWS = 25
const MAX_TABLES = 6
const MAX_SECTIONS = 30
const MAX_FIELDS = 60
/** Roughly what stays useful in a prompt without swamping the conversation. */
const MAX_TEXT = 8_000

/**
 * Read the current page.
 *
 * `query` is a filter, not a search engine: with it, only sections, fields and
 * tables mentioning the words survive. A price book with four hundred rows would
 * otherwise arrive as four hundred rows, and the answer to "what does the salt
 * cell cost" would be buried in it.
 */
export function readPage(root?: ParentNode, query?: string): PageReading {
  // Undefined means "the page the user is looking at". There is no page at all
  // during server rendering, which is a real state rather than an error.
  const doc = root ?? (typeof document === 'undefined' ? null : document)
  if (!doc) {
    return { title: '', url: '', headings: [], sections: [], fields: [], tables: [], truncated: false }
  }

  const scope = (doc as Document).querySelector?.('main') ?? doc
  const terms = (query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(term => term.replace(/[^a-z0-9$%.-]/g, ''))
    .filter(term => term.length > 2)

  const matches = (text: string): boolean =>
    terms.length === 0 || terms.some(term => text.toLowerCase().includes(term))

  const headings: string[] = []
  const sections: PageSection[] = []
  for (const node of Array.from(scope.querySelectorAll('h1, h2, h3, h4'))) {
    if (isHidden(node)) continue
    const heading = clean(node.textContent)
    if (!heading) continue
    headings.push(heading)
    if (sections.length >= MAX_SECTIONS) continue
    const text = textUntilNextHeading(node)
    if (matches(`${heading} ${text}`)) sections.push({ heading, text })
  }

  const tables: PageTable[] = []
  for (const node of Array.from(scope.querySelectorAll('table'))) {
    if (isHidden(node) || tables.length >= MAX_TABLES) continue
    const table = readTable(node, matches)
    if (table) tables.push(table)
  }

  const fields = readFields(scope, matches)

  const reading: PageReading = {
    title: clean((doc as Document).title ?? '') || (headings[0] ?? ''),
    url: typeof location === 'undefined' ? '' : location.pathname,
    headings: headings.slice(0, MAX_SECTIONS),
    sections,
    fields: fields.slice(0, MAX_FIELDS),
    tables,
    truncated: false,
  }

  return capped(reading)
}

/** A table as rows, with the header kept so a value knows which column it is in. */
function readTable(node: Element, matches: (text: string) => boolean): PageTable | null {
  const headerCells = Array.from(node.querySelectorAll('thead th, thead td'))
  const headers = headerCells.map(cell => clean(cell.textContent)).filter(Boolean)

  const bodyRows = Array.from(node.querySelectorAll('tbody tr'))
  const rowsSource = bodyRows.length > 0 ? bodyRows : Array.from(node.querySelectorAll('tr')).slice(1)

  const rows: string[][] = []
  let skipped = 0
  for (const row of rowsSource) {
    if (isHidden(row)) continue
    const cells = Array.from(row.querySelectorAll('th, td')).map(cell => clean(cell.textContent))
    if (cells.every(cell => cell === '')) continue
    if (!matches(cells.join(' '))) continue
    if (rows.length >= MAX_TABLE_ROWS) {
      skipped += 1
      continue
    }
    rows.push(cells)
  }

  if (rows.length === 0 && headers.length === 0) return null

  const caption = clean(node.querySelector('caption')?.textContent ?? '')
  return { caption: caption || null, headers, rows, truncatedRows: skipped }
}

/**
 * Label/value pairs.
 *
 * Three shapes cover almost everything the app renders: definition lists, form
 * controls with a label, and anything explicitly annotated. The annotation is
 * the escape hatch for a component whose markup does not fit the other two.
 */
function readFields(scope: ParentNode, matches: (text: string) => boolean): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = []

  const definitions = Array.from(scope.querySelectorAll('dt'))
  for (const term of definitions) {
    const value = term.nextElementSibling
    if (!value || value.tagName !== 'DD' || isHidden(term)) continue
    push(clean(term.textContent), clean(value.textContent))
  }

  for (const node of Array.from(scope.querySelectorAll('input, select, textarea'))) {
    if (isHidden(node)) continue
    const control = node as HTMLInputElement
    if (control.type === 'password' || control.type === 'hidden') continue
    const label = labelFor(control)
    if (!label) continue
    const value =
      control.type === 'checkbox' || control.type === 'radio'
        ? control.checked
          ? 'yes'
          : 'no'
        : clean(control.value)
    push(label, value)
  }

  for (const node of Array.from(scope.querySelectorAll('[data-voice-label]'))) {
    if (isHidden(node)) continue
    push(clean(node.getAttribute('data-voice-label') ?? ''), clean(node.textContent))
  }

  return fields

  function push(label: string, value: string): void {
    if (!label || !value) return
    if (!matches(`${label} ${value}`)) return
    fields.push({ label, value })
  }
}

function labelFor(control: HTMLInputElement): string {
  const aria = control.getAttribute('aria-label')
  if (aria) return clean(aria)

  const id = control.getAttribute('id')
  if (id) {
    const label = control.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label) return clean(label.textContent)
  }

  const wrapping = control.closest('label')
  if (wrapping) return clean(wrapping.textContent)

  return clean(control.getAttribute('placeholder') ?? '')
}

/** Text between a heading and the next one, which is what the heading is about. */
function textUntilNextHeading(heading: Element): string {
  const parts: string[] = []
  let node = heading.nextElementSibling

  while (node && !/^H[1-4]$/.test(node.tagName)) {
    if (!isHidden(node) && !node.matches(SKIP_SELECTOR)) {
      const text = clean(node.textContent)
      if (text) parts.push(text)
    }
    if (parts.join(' ').length > 600) break
    node = node.nextElementSibling
  }

  return clean(parts.join(' ')).slice(0, 600)
}

function isHidden(node: Element): boolean {
  if (node.matches(SKIP_SELECTOR)) return true
  if (node.closest('[data-voice-hide]')) return true
  // `offsetParent` is null for display:none, and cheap. Deliberately not
  // getComputedStyle: this runs over every node on the page.
  const element = node as HTMLElement
  return element.hidden === true
}

function clean(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Hold the reading under the size cap.
 *
 * Trimmed from the back, and flagged. Silently sending half a page is how a
 * model confidently answers "that is everything" when it is not.
 */
function capped(reading: PageReading): PageReading {
  let budget = MAX_TEXT
  const sections: PageSection[] = []
  for (const section of reading.sections) {
    const cost = section.heading.length + section.text.length
    if (cost > budget) break
    budget -= cost
    sections.push(section)
  }

  const tables: PageTable[] = []
  for (const table of reading.tables) {
    const cost = table.rows.reduce((sum, row) => sum + row.join('').length, 0)
    if (cost > budget) break
    budget -= cost
    tables.push(table)
  }

  const fields: { label: string; value: string }[] = []
  for (const field of reading.fields) {
    const cost = field.label.length + field.value.length
    if (cost > budget) break
    budget -= cost
    fields.push(field)
  }

  return {
    ...reading,
    sections,
    tables,
    fields,
    truncated:
      sections.length < reading.sections.length ||
      tables.length < reading.tables.length ||
      fields.length < reading.fields.length ||
      reading.tables.some(table => table.truncatedRows > 0),
  }
}
