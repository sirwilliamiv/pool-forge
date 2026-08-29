// Filling in what is on screen.
//
// The read half already existed; this is the other half of operating a page by
// voice. It drives the actual form controls rather than writing to a store,
// which means whatever validation, formatting and save behaviour the form
// already has applies unchanged — a voice-filled field and a typed one are the
// same field.

export interface FillRequest {
  /** The visible label, as a person would say it. */
  label: string
  /** For a checkbox, "yes"/"no"/"true"/"false" all work. */
  value: string
}

export interface FillOutcome {
  label: string
  /** What the control holds now, so the model can confirm what it did. */
  value: string
  filled: boolean
  reason?: string
}

import { labelForElement } from './page-labels'

type Fillable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const YES = new Set(['yes', 'true', 'on', 'checked', 'tick', 'ticked', '1'])
const NO = new Set(['no', 'false', 'off', 'unchecked', 'untick', '0'])

/** Input types that want a machine format rather than what a person says. */
const DATE_TYPES = new Set(['date', 'datetime-local', 'month', 'time'])

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

/**
 * A spoken date as the input element wants it.
 *
 * A `type="date"` field accepts `yyyy-mm-dd` and nothing else: given "March 4th"
 * or "3/4/2027" it stays empty and reports no error, so the agent would say it
 * set a date that was never set. Returns null rather than guessing at a string
 * it cannot read, since a wrong expiry on a proposal is worse than a question.
 */
export function toInputDate(spoken: string, type: string): string | null {
  const text = spoken.trim().toLowerCase()
  if (!text) return ''

  if (type === 'time') {
    const match = /^(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?$/.exec(text)
    if (!match) return null
    let hour = Number(match[1])
    const minute = match[2] ?? '00'
    if (match[3] === 'pm' && hour < 12) hour += 12
    if (match[3] === 'am' && hour === 12) hour = 0
    if (hour > 23 || Number(minute) > 59) return null
    return `${String(hour).padStart(2, '0')}:${minute}`
  }

  // Already machine-formatted. Passed through untouched so a model that read the
  // field first and echoed its format is not second-guessed.
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(text)
  if (iso) return type === 'month' ? `${iso[1]}-${iso[2]}` : text.slice(0, 10)

  const parts = parseSpokenDate(text)
  if (!parts) return null
  const { year, month, day } = parts
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const stamp = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return type === 'month' ? stamp.slice(0, 7) : stamp
}

function parseSpokenDate(text: string): { year: number; month: number; day: number } | null {
  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/g, '$1').replace(/,/g, ' ')

  // "4 march 2027" or "march 4 2027"
  const named = MONTHS.findIndex(month => cleaned.includes(month))
  if (named >= 0) {
    const numbers = cleaned.match(/\d+/g)?.map(Number) ?? []
    const day = numbers.find(value => value <= 31)
    const year = numbers.find(value => value >= 1_000)
    if (day === undefined) return null
    return { year: year ?? new Date().getFullYear(), month: named + 1, day }
  }

  // "3/4/2027". Read as US order, which is the order the rest of this app uses.
  const slashes = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(cleaned.trim())
  if (slashes) {
    const year = Number(slashes[3])
    return {
      year: year < 100 ? 2_000 + year : year,
      month: Number(slashes[1]),
      day: Number(slashes[2]),
    }
  }

  return null
}

/**
 * Set fields by their visible label.
 *
 * Reports per field rather than failing the whole call: filling four of five is
 * a useful outcome the model can describe, where an all-or-nothing failure
 * leaves the user with no idea which parts landed.
 */
export async function fillPage(requests: FillRequest[], root?: ParentNode): Promise<FillOutcome[]> {
  const doc = root ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return requests.map(r => ({ ...r, filled: false, reason: 'no page' }))

  const scope = (doc as Document).querySelector?.('main') ?? doc
  const outcomes: FillOutcome[] = []
  // Sequential, not concurrent: a component-library select opens a menu, and two
  // of them opening at once fight over the same overlay.
  for (const request of requests) {
    outcomes.push(await fillOne(request, doc as Document, scope))
  }
  return outcomes
}

async function fillOne(
  request: FillRequest,
  doc: Document,
  scope: ParentNode,
): Promise<FillOutcome> {
  const controls = Array.from(scope.querySelectorAll<Fillable>('input, select, textarea'))

  {
    // A radio group is addressed by the group's name and the option's own label:
    // "set status to approved", not "tick the approved radio button".
    const radio = findRadioInGroup(controls, request)
    if (radio) {
      if (!radio.checked) radio.click()
      return { label: request.label, value: request.value, filled: true }
    }

    const control = findControl(controls, request.label)
    if (!control) {
      // Not a native control. It may still be a select the user can see: a
      // component library renders those as a button, and its real <select> is
      // hidden, so this is the only way to reach "Status" on the project page.
      const combo = findComboBox(scope, request.label)
      if (combo) return openAndPick(combo, request, doc)
      return { label: request.label, value: '', filled: false, reason: 'no field with that label' }
    }
    // Never fill a credential, and never fight a control the page disabled.
    if (control instanceof HTMLInputElement && (control.type === 'password' || control.type === 'hidden')) {
      return { label: request.label, value: '', filled: false, reason: 'not a fillable field' }
    }
    const readOnly = 'readOnly' in control && control.readOnly
    if (control.disabled || readOnly) {
      return { label: request.label, value: '', filled: false, reason: 'field is read-only' }
    }

    return applyValue(control, request)
  }
}

/** A component-library select: a button that says what is chosen. */
function findComboBox(scope: ParentNode, label: string): HTMLElement | null {
  const wanted = normalise(label)
  const boxes = Array.from(scope.querySelectorAll<HTMLElement>('[role="combobox"]'))
    .filter(box => (box as HTMLButtonElement).disabled !== true)
    .map(box => ({ box, text: normalise(labelOf(box)) }))

  return (
    boxes.find(entry => entry.text === wanted)?.box ??
    boxes.find(entry => entry.text.includes(wanted))?.box ??
    null
  )
}

/**
 * Open the menu, click the matching option, and confirm what was chosen.
 *
 * A component library select cannot be set by assigning a value: the visible
 * control is a button, its state lives in the component, and the hidden native
 * select is aria-hidden and not wired to it. Clicking is what a user does and
 * the only thing the component reliably listens to.
 */
async function openAndPick(
  combo: HTMLElement,
  request: FillRequest,
  doc: Document,
): Promise<FillOutcome> {
  const before = clean(combo.textContent)
  combo.click()

  // Options render into a portal outside the control, so they are searched for
  // document-wide and only after the menu has had a frame to appear.
  const option = await waitForOption(doc, request.value)
  if (!option) {
    const offered = Array.from(doc.querySelectorAll('[role="option"]'))
      .map(node => clean(node.textContent))
      .filter(Boolean)
      .slice(0, 8)
    // Leave the menu as it was found rather than open over the page.
    combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return {
      label: request.label,
      value: before,
      filled: false,
      reason: `not one of the choices${offered.length ? `: ${offered.join(', ')}` : ''}`,
    }
  }

  option.click()
  return { label: request.label, value: clean(option.textContent), filled: true }
}

async function waitForOption(doc: Document, value: string): Promise<HTMLElement | null> {
  const wanted = normalise(value)
  for (let attempt = 0; attempt < 20; attempt++) {
    const options = Array.from(doc.querySelectorAll<HTMLElement>('[role="option"]'))
    const match =
      options.find(node => normalise(node.textContent ?? '') === wanted) ??
      options.find(node => normalise(node.textContent ?? '').includes(wanted))
    if (match) return match
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  return null
}

function clean(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * A radio inside a group named by the request's label.
 *
 * Grouped by the shared `name` or the enclosing fieldset legend, both of which
 * are how a page says "these three belong together".
 */
function findRadioInGroup(controls: Fillable[], request: FillRequest): HTMLInputElement | null {
  const wantedGroup = normalise(request.label)
  const wantedOption = normalise(request.value)
  if (!wantedGroup || !wantedOption) return null

  const radios = controls.filter(
    (control): control is HTMLInputElement =>
      control instanceof HTMLInputElement && control.type === 'radio' && !control.disabled,
  )

  const inGroup = radios.filter(radio => {
    const groupName = normalise(radio.name)
    const legend = normalise(radio.closest('fieldset')?.querySelector('legend')?.textContent ?? '')
    return (
      (groupName !== '' && (groupName === wantedGroup || groupName.includes(wantedGroup))) ||
      (legend !== '' && legend.includes(wantedGroup))
    )
  })

  return (
    inGroup.find(radio => normalise(labelOf(radio)) === wantedOption) ??
    inGroup.find(radio => normalise(labelOf(radio)).includes(wantedOption)) ??
    inGroup.find(radio => normalise(radio.value) === wantedOption) ??
    null
  )
}

/** Best label match: exact first, then a contains match, so "length" finds "Pool length". */
function findControl(controls: Fillable[], label: string): Fillable | null {
  const wanted = normalise(label)
  if (!wanted) return null

  const labelled = controls
    .map(control => ({ control, text: normalise(labelOf(control)) }))
    .filter(entry => entry.text.length > 0)

  return (
    labelled.find(entry => entry.text === wanted)?.control ??
    labelled.find(entry => entry.text.includes(wanted))?.control ??
    labelled.find(entry => wanted.includes(entry.text))?.control ??
    null
  )
}

function applyValue(control: Fillable, request: FillRequest): FillOutcome {
  const spoken = request.value.trim()

  if (control instanceof HTMLInputElement && DATE_TYPES.has(control.type)) {
    const iso = toInputDate(spoken, control.type)
    if (!iso) {
      return {
        label: request.label,
        value: '',
        filled: false,
        reason: `could not read "${spoken}" as a ${control.type}`,
      }
    }
    setNatively(control, iso)
    return { label: request.label, value: control.value, filled: true }
  }

  if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
    const wanted = YES.has(spoken.toLowerCase()) ? true : NO.has(spoken.toLowerCase()) ? false : null
    if (wanted === null) {
      return { label: request.label, value: '', filled: false, reason: 'expected yes or no' }
    }
    if (control.checked !== wanted) control.click()
    return { label: request.label, value: control.checked ? 'yes' : 'no', filled: true }
  }

  if (control instanceof HTMLInputElement && control.type === 'number' && spoken !== '') {
    // "thirty two feet" arrives as text around a number. A number input rejects
    // anything else outright and would silently stay empty.
    const numeric = spoken.replace(/[^0-9.\-]/g, '')
    if (numeric === '' || Number.isNaN(Number(numeric))) {
      return { label: request.label, value: '', filled: false, reason: `"${spoken}" is not a number` }
    }
    setNatively(control, numeric)
    return { label: request.label, value: control.value, filled: true }
  }

  if (control instanceof HTMLSelectElement) {
    const option = Array.from(control.options).find(
      candidate =>
        normalise(candidate.label) === normalise(spoken) ||
        normalise(candidate.value) === normalise(spoken) ||
        normalise(candidate.label).includes(normalise(spoken)),
    )
    if (!option) {
      const choices = Array.from(control.options).map(o => o.label).filter(Boolean).slice(0, 8)
      return {
        label: request.label,
        value: '',
        filled: false,
        reason: `not one of the choices${choices.length ? `: ${choices.join(', ')}` : ''}`,
      }
    }
    setNatively(control, option.value)
    return { label: request.label, value: option.label, filled: true }
  }

  setNatively(control, spoken)
  return { label: request.label, value: control.value, filled: true }
}

/**
 * Set the value the way a keystroke would.
 *
 * Assigning `.value` directly does not notify React: it tracks the previous
 * value on the node and treats an identical-looking change as no change, so the
 * field would show the new text and the form state would still hold the old.
 * Going through the prototype setter and dispatching a bubbling input event is
 * what makes it a real edit.
 */
function setNatively(control: Fillable, value: string): void {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype

  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(control, value)
  else control.value = value

  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Shared with the reader, so every field it names is one this can address. */
function labelOf(control: HTMLElement): string {
  return labelForElement(control)
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}
