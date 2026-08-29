// The tool reference has to describe the editor that exists.
//
// It was written ahead of the editor and drifted apart from it: 51 tools
// documented, 12 on the toolbar, and exactly 3 ids in both. So /docs/tools
// listed 48 tools nobody could use, omitted 9 that worked, and its voice
// examples taught the agent to ask for things that are not there. A reference
// nobody can trust is worse than none, because somebody acts on it.

import { describe, expect, it } from 'vitest'

import { EDITOR_TOOL_IDS } from '@/modules/editor/interactions/toolIds'
import { TOOLS } from '@/modules/editor/tools'

const built = TOOLS.filter(tool => tool.status === 'built')
const ids = new Set(TOOLS.map(tool => tool.id))

describe('tool catalogue', () => {
  it('found both lists', () => {
    // Guards the guard. If either import went empty, every assertion below
    // would pass while checking nothing.
    expect(TOOLS.length).toBeGreaterThan(10)
    expect(EDITOR_TOOL_IDS.length).toBeGreaterThan(5)
  })

  it('documents every tool the toolbar exposes', () => {
    const missing = EDITOR_TOOL_IDS.filter(id => !ids.has(id))
    expect(missing, `on the toolbar and undocumented: ${missing.join(', ')}`).toEqual([])
  })

  it('marks a tool built only when it really is', () => {
    // The direction that matters most: calling something built when it has no
    // button is how the page started lying in the first place.
    const real = new Set<string>(EDITOR_TOOL_IDS)
    const overclaimed = built.filter(tool => !real.has(tool.id)).map(tool => tool.id)
    expect(overclaimed, `marked built with no tool behind it: ${overclaimed.join(', ')}`).toEqual([])
  })

  it('marks every real tool as built', () => {
    const understated = EDITOR_TOOL_IDS.filter(
      id => TOOLS.find(tool => tool.id === id)?.status !== 'built',
    )
    expect(understated, `real but listed as planned: ${understated.join(', ')}`).toEqual([])
  })

  it('gives a built tool the shortcut it actually has', () => {
    // A printed shortcut that does nothing is a small lie with a long tail: the
    // user concludes the keyboard does not work and stops trying.
    for (const tool of built) {
      if (tool.shortcut === null) continue
      expect(tool.shortcut, tool.id).toMatch(/^[A-Za-z]$/)
    }
  })

  it('never lists the same tool twice', () => {
    expect(new Set(TOOLS.map(tool => tool.id)).size).toBe(TOOLS.length)
  })

  it('describes every tool well enough to be worth reading', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length, tool.id).toBeGreaterThan(20)
      expect(tool.name.length, tool.id).toBeGreaterThan(2)
    }
  })
})
