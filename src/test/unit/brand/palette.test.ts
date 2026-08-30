// The brand rule, enforced rather than asked for.
//
// `docs/brand-bible.md` says what the product looks like, and a document is a
// suggestion until something fails. This is the something: any colour written
// into UI code that is not in the palette fails this test by file and by value.
//
// It is a ratchet, not a wall. When it was written there were 130 raw hex values
// across 30 files, most predating the bible, and a rule that demanded they all
// go before anything else shipped would have been switched off within a day.
// So every one of those files is listed below with a reason, and the list may
// only ever get shorter. A file not on the list must be clean, which means every
// new component and every file anybody touches deliberately.
//
// To retire an entry: replace its hex values with tokens from `@/lib/brand`,
// delete the line, watch this pass.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ACCENT_FAMILIES, INK, SPECTRUM, TINTS } from '@/lib/brand'

const ROOTS = ['src/components', 'src/app']
const EXTENSIONS = new Set(['.ts', '.tsx', '.css'])

/**
 * Colours a file may contain.
 *
 * The palette, plus pure black and white, which are structural rather than
 * decorative: a shadow and a knockout are not brand decisions.
 */
const ALLOWED: ReadonlySet<string> = new Set(
  [
    ...Object.values(SPECTRUM),
    ...Object.values(INK),
    ...Object.values(TINTS),
    ...Object.values(ACCENT_FAMILIES).flatMap(family => Object.values(family)),
    '#000000',
    '#FFFFFF',
  ].map(hex => hex.toUpperCase()),
)

/**
 * Files that predate the bible.
 *
 * Each carries why it is here. This list may shrink and must never grow: adding
 * to it is choosing to ship something off-brand, which is the decision this test
 * exists to make somebody say out loud.
 */
const LEGACY: Readonly<Record<string, string>> = {
  // The pre-bible token layer the whole editor still reads from. Retiring it
  // means moving every component onto brand tokens, which is the real work this
  // ratchet exists to schedule.
  'src/app/globals.css': 'The pre-bible token layer the whole editor still reads from.',

  // Documents, not screens. These render standalone and are styled for paper
  // and for what a county planner expects to see, so the screen palette does
  // not straightforwardly apply.
  'src/components/exports/DrawingSvg.tsx': 'Export palette, keyed to what prints rather than to the screen.',
  'src/components/exports/TechnicalPlanSvg.tsx': 'Permit-sheet conventions: line weights and greys a county expects.',
  'src/components/exports/PlanLegend.tsx': 'Part of the permit sheet, sharing its greys.',

  // Physical materials rather than interface. Water, plaster, stucco, grass and
  // daylight are lit surfaces in a 3D scene, and picking them from a brand
  // spectrum would make the pool the wrong colour rather than make it on brand.
  'src/components/editor/three/Materials.ts': 'Water, plaster and stucco: lit materials, not interface colour.',
  'src/components/editor/three/Ground.tsx': 'Ground plane and grid, tuned against the lighting rig.',
  'src/components/editor/three/Lighting.tsx': 'Sky colour and bounce light, tuned by eye against the scene.',
  'src/components/editor/three/objects/Terrain.tsx': 'Grass and earth, lit rather than chosen from a palette.',
  'src/components/editor/three/SceneCanvas.tsx': 'Scene background and fog, matched to the ground plane.',
  'src/components/editor/three/objects/GenericStencil.tsx': 'The fallback slab, matched to the scene rather than the brand.',
  'src/components/editor/three/objects/PropertyLine.tsx': 'Survey line conventions a surveyor expects to see.',
  'src/components/editor/shell/SunDial.tsx': 'A sky gradient from night to noon, which is a physical range.',

  // Overlays carrying meaning the brand palette does not encode yet: a
  // validation error, a build phase, a detected feature's confidence.
  'src/components/editor/three/BuildOverlay.tsx': 'Construction-phase colour coding, meaning the palette does not encode.',
  'src/components/editor/three/PlanOverlay.tsx': 'Plan annotation colours, still on the old accent.',
  'src/components/imports/IntentOverlay.tsx': 'Per-feature confidence colours from the import pipeline.',

  // Documents again: the proposal renders standalone for a customer.
  'src/components/exports/ProposalDocument.tsx': 'Customer document, styled inline because it renders standalone.',
  'src/components/exports/ConstructionSheet.tsx': 'Same, for the construction set.',
  'src/components/exports/SitePlanSvg.tsx': 'Same, for the site plan.',
  'src/components/exports/ScreenEnclosureRfq.tsx': 'Same, for the enclosure RFQ.',

  // Still on the pre-bible accent. These are the cheapest to retire.
  'src/components/editor/three/ToolGestures.tsx': 'Uses the old --pf-accent blue directly.',
  'src/components/settings/CompanySettingsForm.tsx': 'Uses the old --pf-accent blue directly.',
  'src/app/intake/[token]/page.tsx': 'Uses the old --pf-accent blue directly.',
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
      continue
    }
    if (EXTENSIONS.has(extname(full))) out.push(full)
  }
  return out
}

interface Offence {
  file: string
  colours: string[]
}

function offences(): Offence[] {
  const found: Offence[] = []
  for (const root of ROOTS) {
    for (const file of walk(join(process.cwd(), root))) {
      const rel = relative(process.cwd(), file)
      if (rel in LEGACY) continue
      const source = readFileSync(file, 'utf8')
      const hexes = [...source.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(match =>
        match[0].toUpperCase(),
      )
      const bad = [...new Set(hexes)].filter(hex => !ALLOWED.has(hex))
      if (bad.length > 0) found.push({ file: rel, colours: bad })
    }
  }
  return found
}

describe('the brand bible, enforced', () => {
  it('has a palette to enforce against', () => {
    // Guards the guard. An empty allowed-set would make everything an offence,
    // and an enormous one would make nothing an offence.
    expect(ALLOWED.size).toBeGreaterThan(20)
  })

  it('ships no colour outside the palette', () => {
    const bad = offences()
    const report = bad
      .map(offence => `  ${offence.file}: ${offence.colours.join(', ')}`)
      .join('\n')
    expect(
      bad,
      bad.length === 0
        ? ''
        : `Colours not in the brand palette. Use a token from @/lib/brand, or if this ` +
          `genuinely cannot follow the bible, add the file to LEGACY with a reason:\n${report}`,
    ).toEqual([])
  })

  // The ratchet only works in one direction if somebody notices it turning the
  // other way. This is that.
  it('keeps the legacy list from growing', () => {
    // The count on the day the rule landed. It may fall and must not rise.
    expect(Object.keys(LEGACY).length).toBeLessThanOrEqual(22)
  })

  it('lists a reason for every legacy file, not just a path', () => {
    for (const [file, reason] of Object.entries(LEGACY)) {
      expect(reason.length, `${file} has no reason`).toBeGreaterThan(20)
    }
  })
})
