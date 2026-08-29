// Pressing what is on screen.
//
// Filling a form is pointless if nothing can save it, so this is the third of
// the three: read the page, change it, then act on it. Like filling, it drives
// the real control, so whatever the button already does — validate, save,
// navigate, open a dialog — happens exactly as it would under a mouse.

export interface ClickResult {
  label: string
  clicked: boolean
  /** Present when it did not click, and readable enough to say out loud. */
  reason?: string
  /** Buttons that were on the page, when the named one was not found. */
  available?: string[]
  /** True when the button looked destructive and no confirmation was given. */
  needsConfirmation?: boolean
}

/**
 * Text that means something is about to be lost.
 *
 * Matched on the button's own words rather than on a list of command ids,
 * because this presses whatever a page happens to render, including buttons
 * added long after this file was written.
 */
const DESTRUCTIVE =
  /\b(delete|remove|discard|archive|revoke|reset|wipe|clear all|unlink|disconnect|cancel subscription)\b/i

type Pressable = HTMLElement

/**
 * Press a button by its visible text.
 *
 * Refuses a destructive-looking button unless `confirmed`, and says which one it
 * refused. Voice misrecognition plus a Delete button is how someone loses a job,
 * and the words on the button are the only signal available here.
 */
export function clickOnPage(label: string, confirmed: boolean, root?: ParentNode): ClickResult {
  const doc = root ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return { label, clicked: false, reason: 'no page' }

  const scope = (doc as Document).querySelector?.('main') ?? doc
  const candidates = pressables(scope)
  const wanted = normalise(label)

  const match =
    candidates.find(entry => entry.text === wanted) ??
    candidates.find(entry => entry.text.includes(wanted)) ??
    candidates.find(entry => wanted.includes(entry.text) && entry.text.length > 2)

  if (!match) {
    return {
      label,
      clicked: false,
      reason: 'no button with that name',
      // Offering the real options beats the agent guessing a second time.
      available: candidates.map(entry => entry.label).slice(0, 12),
    }
  }

  if (DESTRUCTIVE.test(match.label) && !confirmed) {
    return {
      label: match.label,
      clicked: false,
      needsConfirmation: true,
      reason: `"${match.label}" will remove something. Say exactly what will be lost and ask before pressing it.`,
    }
  }

  match.node.click()
  return { label: match.label, clicked: true }
}

function pressables(scope: ParentNode): { node: Pressable; label: string; text: string }[] {
  const nodes = scope.querySelectorAll<Pressable>(
    'button, [role="button"], input[type="submit"], input[type="button"], a[href]',
  )

  const found: { node: Pressable; label: string; text: string }[] = []
  for (const node of Array.from(nodes)) {
    if ((node as HTMLButtonElement).disabled) continue
    if (node.hidden || node.closest('[data-voice-hide]')) continue
    if (node.getAttribute('aria-hidden') === 'true') continue

    const label =
      clean(node.getAttribute('aria-label') ?? '') ||
      clean((node as HTMLInputElement).value ?? '') ||
      clean(node.textContent)
    if (!label || label.length > 60) continue

    found.push({ node, label, text: normalise(label) })
  }
  return found
}

function clean(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function normalise(text: string): string {
  return clean(text).toLowerCase()
}
