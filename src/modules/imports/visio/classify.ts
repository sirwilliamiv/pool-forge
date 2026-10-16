// A master's name (and the file it came from) to a catalogue category and the
// shape kind it becomes on the canvas. Pure. The builder can change both in the
// preview; this is only the first guess.
//
// An ordered table, first match wins, tested against the lower-cased name and,
// where a rule names one, the lower-cased file name.

import { ShapeKind, StencilCategory } from '@prisma/client'
import type { PlaceableShapeKind } from './types'

export interface Classification {
  category: StencilCategory
  shapeKind: PlaceableShapeKind
}

interface Rule extends Classification {
  test: RegExp
  file?: RegExp
}

const POOL_OUTLINE = /grecian|roman|rectangle|kidney|freeform|corners|lazy|oval|master$/

const RULES: readonly Rule[] = [
  { test: /\bspa\b|spa\./, category: StencilCategory.WATER_OUTDOOR, shapeKind: ShapeKind.SPA },
  // A pool outline drawn in a spa file is a spa (a `Roman` in `Spa.vss`).
  { test: POOL_OUTLINE, file: /spa/, category: StencilCategory.WATER_OUTDOOR, shapeKind: ShapeKind.SPA },
  { test: POOL_OUTLINE, file: /pool/, category: StencilCategory.POOL_SHAPE, shapeKind: ShapeKind.POLYGON_POOL },
  { test: /grass/, category: StencilCategory.DECK_HOUSE, shapeKind: ShapeKind.GRASS_AREA },
  { test: /paver/, category: StencilCategory.DECK_HOUSE, shapeKind: ShapeKind.PAVER_DECK },
  {
    test: /house|roof|pillar|pedestal|door|stair|stepping|wall/,
    category: StencilCategory.DECK_HOUSE,
    shapeKind: ShapeKind.SKETCH_PATH,
  },
  // Before the deck rule: `Deck Jets` are jets, not a deck.
  {
    test: /step|ledge|bench|shelf|stool|jet|bubbler|seat|swim out|umbrella/,
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
    if (rule.file && !rule.file.test(f)) continue
    return { category: rule.category, shapeKind: rule.shapeKind }
  }
  return { ...FALLBACK }
}
