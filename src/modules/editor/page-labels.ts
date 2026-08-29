// Working out what a control is called.
//
// Shared by reading and filling, because a field the reader can name and the
// filler cannot address is worse than one neither can see: the agent tells the
// user it can change something and then cannot find it.
//
// The last fallback is the one that matters in this app. Its form fields render
// as `<div><label>Salesperson</label><input …></div>` — a label with no `for`
// that does not wrap its input, which is what the Shadcn Label and Input
// components produce together. Every standard lookup misses it, so a real
// project page offered twenty-six inputs of which three were addressable.

/** Controls a person can fill in, including the ones that only look like selects. */
export type LabelledControl = HTMLElement

export function labelForElement(control: LabelledControl): string {
  const aria = control.getAttribute('aria-label')
  if (aria) return clean(aria)

  const labelledBy = control.getAttribute('aria-labelledby')
  if (labelledBy) {
    const target = control.ownerDocument?.getElementById(labelledBy)
    if (target?.textContent) return clean(target.textContent)
  }

  const id = control.getAttribute('id')
  if (id) {
    const label = control.ownerDocument?.querySelector(`label[for="${cssEscape(id)}"]`)
    if (label?.textContent) return clean(label.textContent)
  }

  const wrapping = control.closest('label')
  if (wrapping?.textContent) return clean(wrapping.textContent)

  const sibling = siblingLabel(control)
  if (sibling) return sibling

  return clean(control.getAttribute('placeholder') ?? control.getAttribute('name') ?? '')
}

/**
 * A label sitting beside the control inside a shared wrapper.
 *
 * Walks up a couple of levels only. Further than that and the nearest label
 * belongs to a different field, which is worse than finding none: filling the
 * wrong box is a silent error where an unfound one is a question.
 */
function siblingLabel(control: LabelledControl): string | null {
  let node: HTMLElement | null = control
  for (let depth = 0; depth < 3 && node; depth++) {
    const parent: HTMLElement | null = node.parentElement
    if (!parent) return null

    const label = parent.querySelector(':scope > label')
    if (label?.textContent) {
      // Only when the wrapper holds one control, or the label is ambiguous
      // between them.
      const controls = parent.querySelectorAll('input, select, textarea, [role="combobox"]')
      if (controls.length <= 2) return clean(label.textContent)
    }
    node = parent
  }
  return null
}

/** Radix and friends render a select as a button; it is still a select to a user. */
export function isComboBox(node: Element): boolean {
  return node.getAttribute('role') === 'combobox'
}

function clean(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/** `CSS.escape` is unavailable in some test environments. */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}
