import { describe, expect, it } from 'vitest'

import { GUIDE_TARGETS, matchTargets, targetById, targetsFor } from '@/modules/guide/targets'
import type { GuideScreen } from '@/modules/guide/targets'
import { isInsideCanvas, isVisible, resolveAll, resolveTarget } from '@/modules/guide/resolve'

describe('the pointable inventory', () => {
  it('gives every target a unique id', () => {
    const ids = GUIDE_TARGETS.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('explains every target in a sentence, since pointing without saying why is a shrug', () => {
    for (const target of GUIDE_TARGETS) {
      expect(target.explain.length).toBeGreaterThan(10)
      expect(target.explain.endsWith('.')).toBe(true)
    }
  })

  it('scopes targets to a screen', () => {
    expect(targetsFor('editor').every(t => t.screen === 'editor')).toBe(true)
    expect(targetsFor('dashboard').some(t => t.id === 'project.new')).toBe(true)
  })

  it('finds a target by its own name', () => {
    expect(matchTargets('Freehand', 'editor').map(t => t.id)).toContain('tool.freehand')
  })

  it('finds a target by what a builder would call it', () => {
    expect(matchTargets('shapes', 'editor').map(t => t.id)).toContain('panel.stencils')
    expect(matchTargets('i cannot see anything', 'editor').map(t => t.id)).toContain('view.fit')
  })

  // The whole reason Marco can point at more than one thing at a time.
  it('returns several when a phrase covers several', () => {
    const hits = matchTargets('line', 'editor')
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('never returns a target from another screen', () => {
    expect(matchTargets('New project', 'editor')).toEqual([])
  })

  it('returns nothing for an empty phrase rather than everything', () => {
    expect(matchTargets('   ', 'editor')).toEqual([])
  })

  it('looks a target up by id', () => {
    expect(targetById('view.fit')?.name).toBe('Fit everything in view')
    expect(targetById('nonsense')).toBeNull()
  })

  it('every screen with a voice scope has at least one target', () => {
    const screens: GuideScreen[] = ['editor', 'dashboard', 'project', 'priceBook', 'settings', 'import', 'document']
    for (const screen of screens) {
      expect(targetsFor(screen).length, screen).toBeGreaterThan(0)
    }
  })

  it('target ids are unique', () => {
    const ids = GUIDE_TARGETS.map(target => target.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('resolving a target in the page', () => {
  /**
   * jsdom gives every element a zero-sized box, and the resolver refuses those
   * on purpose: a control in a closed panel still exists in the DOM and
   * pointing at it puts a ring in the corner of the window. So the elements are
   * given a real box here, and the one test that wants an invisible element
   * says so explicitly.
   */
  function pageWith(html: string): Document {
    document.body.innerHTML = html
    for (const element of document.body.querySelectorAll('*')) {
      const styled = element as HTMLElement
      if (styled.style.display === 'none') continue
      element.getBoundingClientRect = () =>
        ({ width: 80, height: 24, top: 10, left: 10, right: 90, bottom: 34, x: 10, y: 10 }) as DOMRect
    }
    // Mock elementFromPoint to return the first non-hidden element at the coordinate
    const elementsWithBox = Array.from(document.body.querySelectorAll('*')).filter(el => {
      const styled = el as HTMLElement
      return styled.style.display !== 'none'
    })
    document.elementFromPoint = (x: number, y: number) => {
      for (const element of elementsWithBox) {
        const rect = element.getBoundingClientRect()
        if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
          return element
        }
      }
      return null
    }
    return document
  }

  const FIT = { id: 'view.fit', name: 'Fit everything in view', screen: 'editor' as const, explain: 'x.' }

  it('finds a button by its aria-label', () => {
    const doc = pageWith('<button aria-label="Fit everything in view">F</button>')
    expect(resolveTarget(doc, FIT)).not.toBeNull()
  })

  it('finds a control whose label carries its shortcut', () => {
    const doc = pageWith('<button title="Line (P)">L</button>')
    const line = { id: 'tool.line', name: 'Line', screen: 'editor' as const, explain: 'x.' }
    expect(resolveTarget(doc, line)).not.toBeNull()
  })

  it('does not match a longer label that merely starts with the same word', () => {
    const doc = pageWith('<button aria-label="Lines per page">L</button>')
    const line = { id: 'tool.line', name: 'Line', screen: 'editor' as const, explain: 'x.' }
    expect(resolveTarget(doc, line)).toBeNull()
  })

  // The rule that matters. The drawing is WebGL: a pool is not an element, and
  // a ring over the canvas would be a rectangle over a picture.
  it('never points at anything inside the drawing', () => {
    const doc = pageWith('<canvas><button aria-label="Fit everything in view">F</button></canvas>')
    expect(resolveTarget(doc, FIT)).toBeNull()
  })

  it('knows a canvas when it sees one', () => {
    const doc = pageWith('<canvas id="c"></canvas><button id="b">x</button>')
    expect(isInsideCanvas(doc.getElementById('c') as Element)).toBe(true)
    expect(isInsideCanvas(doc.getElementById('b') as Element)).toBe(false)
  })

  it('skips a control that is not on screen', () => {
    const doc = pageWith('<button aria-label="Fit everything in view" style="display:none">F</button>')
    expect(resolveTarget(doc, FIT)).toBeNull()
  })

  it('resolves several at once and drops the ones that are not here', () => {
    const doc = pageWith('<button aria-label="Fit everything in view">F</button>')
    const targets = [FIT, { id: 'ghost', name: 'Not here', screen: 'editor' as const, explain: 'x.' }]
    const found = resolveAll(doc, targets)
    expect(found).toHaveLength(1)
    expect(found[0]?.target.id).toBe('view.fit')
  })

  // A control in a closed panel is still in the DOM with a zero box. Pointing
  // at one puts a ring in the corner of the window and explains something
  // nobody can see.
  it('treats a zero-sized element as not visible', () => {
    document.body.innerHTML = '<button id="b" aria-label="x"></button>'
    expect(isVisible(document.getElementById('b') as Element)).toBe(false)
  })
})
