// A master's name (and the file it came from) to a catalogue category and the
// shape kind it becomes on the canvas. Pure. The builder can change both in the
// preview; this is only the first guess.
//
// An ordered table, first match wins, tested against the lower-cased name and,
// where a rule names one, the lower-cased file name. A rule with `unless` is
// skipped when that pattern also matches the name.
//
// Only a whole spa may become a SPA. A spa prices as a spa, so a master named
// for a part of one (Spa Step, Spa Coping, Spa Seat, Spa Drains, Spa Light
// Return) must land as a detail outline, never as a second spa in an estimate.

import { ShapeKind, StencilCategory } from '@prisma/client'
import type { PlaceableShapeKind } from './types'

export interface Classification {
  category: StencilCategory
  shapeKind: PlaceableShapeKind
}

interface Rule extends Classification {
  test: RegExp
  unless?: RegExp
  file?: RegExp
}

const POOL_OUTLINE = /grecian|roman|rectangle|kidney|freeform|corners|lazy|oval|master$/

/** Words that make a "spa" name a part of a spa rather than the spa itself. */
const SPA_PART = /step|coping|seat|bench|ledge|drain|light|return|jet|beam|template/

/** A spa shell named by its size alone in a spa file: `6' ID`, `8x8`, `6x6 Corner`. */
const SPA_BY_SIZE = /\bid\b|^\d+'?\s*x\s*\d+'?(\s+corner)?$/

const RULES: readonly Rule[] = [
  // `6' ID Spa with Seating` is a whole spa that happens to mention a seat.
  { test: /\bspa with\b/, category: StencilCategory.WATER_OUTDOOR, shapeKind: ShapeKind.SPA },
  { test: /spa\b/, unless: SPA_PART, category: StencilCategory.WATER_OUTDOOR, shapeKind: ShapeKind.SPA },
  // A pool outline drawn in a spa file is a spa (a `Roman` in `Spa.vss`).
  { test: POOL_OUTLINE, file: /spa/, category: StencilCategory.WATER_OUTDOOR, shapeKind: ShapeKind.SPA },
  { test: POOL_OUTLINE, file: /pool/, category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL },
  { test: /grass/, category: StencilCategory.DECK_HOUSE, shapeKind: ShapeKind.GRASS_AREA },
  { test: /paver/, category: StencilCategory.DECK_HOUSE, shapeKind: ShapeKind.PAVER_DECK },
  {
    test: /house|roof|pillar|pedestal|door|stair|stepping|wall|coping|beam|brick/,
    category: StencilCategory.DECK_HOUSE,
    shapeKind: ShapeKind.SKETCH_PATH,
  },
  // Before the deck rule: `Deck Jets` are jets, not a deck. (`Seaint` is the
  // designer's own spelling of a seating ring.)
  {
    test: /step|ledge|bench|shelf|stool|jet|bubbler|seat|seaint|swim out|umbrella/,
    category: StencilCategory.INTERIOR_FEATURE,
    shapeKind: ShapeKind.SKETCH_PATH,
  },
  // Before the deck rule: a `Concrete Water Bowl` is a bowl.
  {
    test: /spillway|waterfall|\bwf\b|bowl|fire|fountain|return/,
    category: StencilCategory.WATER_OUTDOOR,
    shapeKind: ShapeKind.SKETCH_PATH,
  },
  { test: /lanai|deck|concrete|patio/, category: StencilCategory.DECK_HOUSE, shapeKind: ShapeKind.CONCRETE_DECK },
  {
    test: /alarm|drain|light|call out|fence|clearview|arrow|check|\bco\b|dimension/,
    category: StencilCategory.CONSTRUCTION_SYMBOL,
    shapeKind: ShapeKind.SKETCH_PATH,
  },
  // Last, after every part and symbol has had its chance.
  { test: SPA_BY_SIZE, file: /spa/, category: StencilCategory.WATER_OUTDOOR, shapeKind: ShapeKind.SPA },
]

const FALLBACK: Classification = {
  category: StencilCategory.CONSTRUCTION_SYMBOL,
  shapeKind: ShapeKind.SKETCH_PATH,
}

export function classifyMaster(name: string, fileName: string): Classification {
  const n = name.toLowerCase()
  const f = fileName.toLowerCase()
  for (const rule of RULES) {
    if (!rule.test.test(n)) continue
    if (rule.unless?.test(n)) continue
    if (rule.file && !rule.file.test(f)) continue
    return { category: rule.category, shapeKind: rule.shapeKind }
  }
  return { ...FALLBACK }
}
