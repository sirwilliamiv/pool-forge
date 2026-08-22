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

type Fillable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const YES = new Set(['yes', 'true', 'on', 'checked', '1'])
const NO = new Set(['no', 'false', 'off', 'unchecked', '0'])

/**
 * Set fields by their visible label.
 *
 * Reports per field rather than failing the whole call: filling four of five is
 * a useful outcome the model can describe, where an all-or-nothing failure
 * leaves the user with no idea which parts landed.
 */
export function fillPage(requests: FillRequest[], root?: ParentNode): FillOutcome[] {
  const doc = root ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return requests.map(r => ({ ...r, filled: false, reason: 'no page' }))

  const scope = (doc as Document).querySelector?.('main') ?? doc
  const controls = Array.from(scope.querySelectorAll<Fillable>('input, select, textarea'))

  return requests.map(request => {
    const control = findControl(controls, request.label)
    if (!control) {
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
  })
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

  if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
    const wanted = YES.has(spoken.toLowerCase()) ? true : NO.has(spoken.toLowerCase()) ? false : null
    if (wanted === null) {
      return { label: request.label, value: '', filled: false, reason: 'expected yes or no' }
    }
    if (control.checked !== wanted) control.click()
    return { label: request.label, value: control.checked ? 'yes' : 'no', filled: true }
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

function labelOf(control: Fillable): string {
  const aria = control.getAttribute('aria-label')
  if (aria) return aria

  const id = control.getAttribute('id')
  if (id) {
    const label = control.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label?.textContent) return label.textContent
  }

  const wrapping = control.closest('label')
  if (wrapping?.textContent) return wrapping.textContent

  return control.getAttribute('placeholder') ?? control.getAttribute('name') ?? ''
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}
