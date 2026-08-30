import type { GuideTarget } from './targets'

// Finding the element a target names, in a live page.
//
// Two rules, and the second is the one worth enforcing in code rather than
// remembering.
//
// Resolution is by accessible name. Every control the guide points at already
// carries an aria-label, a title or visible text because it had to for screen
// readers, so this rides on something maintained for its own reasons. A button
// that loses its label breaks accessibility long before it breaks the guide,
// which is the right order for a failure to happen in.
//
// And nothing inside the drawing is pointable, ever. The canvas is WebGL: a
// pool is not an element, it has no box, and a highlight over the canvas would
// be a rectangle over a picture rather than a ring around a control. Refusing
// here means a bad target resolves to nothing and the agent says it cannot find
// it, rather than lighting up the whole drawing.

export interface Resolved {
  target: GuideTarget
  element: Element
}

/** True when the element is the drawing, or lives inside it. */
export function isInsideCanvas(element: Element): boolean {
  if (element.tagName.toLowerCase() === 'canvas') return true
  return element.closest('canvas') !== null
}

function accessibleNames(element: Element): string[] {
  const names: string[] = []
  const aria = element.getAttribute('aria-label')
  if (aria) names.push(aria)
  const title = element.getAttribute('title')
  if (title) names.push(title)
  const text = element.textContent
  if (text && text.trim().length > 0 && text.trim().length < 60) names.push(text)
  return names.map(name => name.toLowerCase().replace(/\s+/g, ' ').trim())
}

/**
 * The element a target names, or null.
 *
 * Matches a leading prefix rather than the whole string, because labels carry
 * their shortcut: the Line tool is titled "Line (P)". Anchoring at the start
 * keeps "Line" from also matching "Lines per page" somewhere else on the page.
 */
export function resolveTarget(doc: Document, target: GuideTarget): Element | null {
  const want = target.name.toLowerCase().replace(/\s+/g, ' ').trim()
  const candidates = doc.querySelectorAll(
    'button, a, [role="tab"], [role="menuitem"], select, summary',
  )

  for (const element of candidates) {
    if (isInsideCanvas(element)) continue
    if (!isVisible(element)) continue
    if (isOccluded(element)) continue
    if (accessibleNames(element).some(name => name === want || name.startsWith(`${want} `) || name.startsWith(`${want}(`))) {
      return element
    }
  }
  return null
}

/** Resolve several, dropping the ones that are not on this page. */
export function resolveAll(doc: Document, targets: readonly GuideTarget[]): Resolved[] {
  const found: Resolved[] = []
  for (const target of targets) {
    const element = resolveTarget(doc, target)
    if (element) found.push({ target, element })
  }
  return found
}

/**
 * Whether an element is actually on screen.
 *
 * A control in a closed panel still exists in the DOM with a zero-sized box, and
 * pointing at it puts a ring in the top-left corner of the window with an
 * explanation of something nobody can see.
 */
export function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (!style) return true
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
}

/**
 * True when something else sits on top of the element's centre.
 *
 * The size and CSS checks in isVisible cannot see a full-screen layer drawn
 * over a control: the editor covers the top nav, and the nav links keep real
 * boxes. A hit test at the centre is the only honest answer. Off-viewport
 * counts as not occluded, because scrolling fixes that and pointing should
 * scroll rather than refuse.
 */
export function isOccluded(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  const view = element.ownerDocument.defaultView
  if (!view) return false
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  if (cx < 0 || cy < 0 || cx > view.innerWidth || cy > view.innerHeight) return false
  const hit = element.ownerDocument.elementFromPoint(cx, cy)
  if (!hit) return true
  return !(element === hit || element.contains(hit) || hit.contains(element))
}
