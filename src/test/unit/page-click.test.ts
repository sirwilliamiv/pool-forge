/** @vitest-environment jsdom */

// Pressing what is on screen.
//
// The third of the three: read the page, change it, act on it. Filling a form is
// pointless if nothing can save it. The part that matters most here is what it
// refuses — voice misrecognition plus a Delete button is how someone loses a job.

import { describe, expect, it, vi } from 'vitest'

import { clickOnPage } from '@/modules/editor/page-click'

function render(html: string): Document {
  document.body.innerHTML = `<main>${html}</main>`
  return document
}

describe('clickOnPage', () => {
  it('presses a button by its visible text', () => {
    const doc = render(`<button id="save">Save changes</button>`)
    const pressed = vi.fn()
    doc.querySelector('#save')!.addEventListener('click', pressed)

    expect(clickOnPage('Save changes', false, doc).clicked).toBe(true)
    expect(pressed).toHaveBeenCalled()
  })

  it('matches the way a person would say it', () => {
    const doc = render(`<button id="s">Save changes</button>`)
    expect(clickOnPage('save', false, doc).clicked).toBe(true)
  })

  it('will not press a destructive button without confirmation', () => {
    // The one that matters. The words on the button are the only signal there is.
    const doc = render(`<button id="d">Delete project</button>`)
    const pressed = vi.fn()
    doc.querySelector('#d')!.addEventListener('click', pressed)

    const result = clickOnPage('Delete project', false, doc)
    expect(result.clicked).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(pressed).not.toHaveBeenCalled()
  })

  it('presses it once confirmed', () => {
    const doc = render(`<button id="d">Delete project</button>`)
    const pressed = vi.fn()
    doc.querySelector('#d')!.addEventListener('click', pressed)

    expect(clickOnPage('Delete project', true, doc).clicked).toBe(true)
    expect(pressed).toHaveBeenCalled()
  })

  it('lists the real buttons when the name does not match', () => {
    // Offering the actual options beats the agent guessing a second time.
    const doc = render(`<button>Save</button><button>Duplicate</button>`)
    const result = clickOnPage('Publish', false, doc)
    expect(result.clicked).toBe(false)
    expect(result.available).toEqual(expect.arrayContaining(['Save', 'Duplicate']))
  })

  it('ignores disabled and hidden buttons', () => {
    const doc = render(`
      <button disabled>Save</button>
      <div data-voice-hide><button>Save</button></div>
    `)
    const result = clickOnPage('Save', false, doc)
    expect(result.clicked).toBe(false)
  })

  it('presses a submit input', () => {
    const doc = render(`<form><input type="submit" value="Create project" /></form>`)
    expect(clickOnPage('Create project', false, doc).clicked).toBe(true)
  })

  it('reads a button labelled only by aria-label', () => {
    const doc = render(`<button aria-label="Add item">+</button>`)
    expect(clickOnPage('Add item', false, doc).clicked).toBe(true)
  })
})
