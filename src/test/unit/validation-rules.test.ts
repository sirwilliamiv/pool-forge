import { describe, it, expect } from 'vitest'
import { ShapeKind } from '@prisma/client'
import { computeMeasurements } from '@/modules/measurements/engine'
import { runValidation } from '@/modules/validation/engine'
import { FIELD_LABELS } from '@/modules/validation/rules'
import type { ValidationContext, ValidationSelections } from '@/modules/validation/types'
import type { Shape } from '@/modules/editor/state/shapes'

// Coverage for the honest validation rules (synthetic always-pass/always-fail
// rules were removed). Every rule here reads real project/measurement/selection
// data.

function poolShape(depths: { shallow: number; deep: number } = { shallow: 3, deep: 5 }): Shape {
  return {
    id: 'p1',
    kind: ShapeKind.RECTANGLE_POOL,
    x: 0,
    y: 0,
    width: 25 * 12,
    height: 12 * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    depthShallow: depths.shallow,
    depthDeep: depths.deep,
  }
}

function deckShape(): Shape {
  return {
    id: 'd1',
    kind: ShapeKind.CONCRETE_DECK,
    x: 0,
    y: 0,
    width: 35 * 12,
    height: 22 * 12,
    rotation: 0,
    zIndex: 0,
    locked: false,
    hidden: false,
  }
}

function makeCtx(opts: {
  shapes?: Shape[]
  poolFields?: Record<string, unknown>
  customerName?: string | null
  address?: string | null
  proposalExpiresAt?: string | null
  selections?: Partial<ValidationSelections>
} = {}): ValidationContext {
  const shapes = opts.shapes ?? [poolShape()]
  const measurements = computeMeasurements(shapes)
  return {
    project: {
      name: 'Project',
      customerName: opts.customerName ?? 'Jane',
      address: opts.address ?? '123 Main St',
      poolFields: opts.poolFields ?? {},
      proposalExpiresAt: opts.proposalExpiresAt ?? '2026-12-31',
    },
    measurements,
    selections: {
      heaterSelected: false,
      saltSelected: false,
      screenSelected: false,
      lightingQuantity: 0,
      ...opts.selections,
    },
    shapeCount: shapes.length,
    hasDeck: measurements.hasDeck,
  }
}

function level(ctx: ValidationContext, id: string): string | undefined {
  return runValidation(ctx).items.find((i) => i.id === id)?.level
}

const FULLY_POPULATED = {
  shapes: [poolShape(), deckShape()],
  customerName: 'Jane Homeowner',
  address: '123 Pool Lane',
  proposalExpiresAt: '2026-12-31',
  poolFields: {
    interiorFinish: 'Pebble',
    equipmentPackage: 'Standard',
    sanitizationPackage: 'Salt',
    deckMaterial: 'Paver',
    heaterSelection: 'Gas 400k',
    screenOption: 'Phifer SunScreen',
  },
  selections: { heaterSelected: true, screenSelected: true },
}

describe('validation — a pool nobody can build says so', () => {
  // The command schemas refuse an out-of-range dimension at the door, so
  // nothing typed today reaches these rules. Drawings saved before those bounds
  // existed do: the $155,928,492 pool is a row in the database, and it prices,
  // exports and prints exactly as it always did. The checklist is the only thing
  // that will ever say so.
  function sized(lengthFt: number, widthFt: number): Shape {
    return { ...poolShape(), width: lengthFt * 12, height: widthFt * 12 }
  }

  it('flags the 99999-foot pool as an error, not a warning', () => {
    expect(level(makeCtx({ shapes: [sized(99_999, 14)] }), 'pool.size.buildable')).toBe('error')
  })

  it('flags a pool too small to build as well as one too big', () => {
    expect(level(makeCtx({ shapes: [sized(0.5, 14)] }), 'pool.size.buildable')).toBe('error')
  })

  it('passes an ordinary pool', () => {
    expect(level(makeCtx({ shapes: [sized(30, 14)] }), 'pool.size.buildable')).toBe('pass')
    expect(level(makeCtx({ shapes: [sized(400, 400)] }), 'pool.size.buildable')).toBe('pass')
  })

  it('says nothing when there is no pool to measure', () => {
    expect(level(makeCtx({ shapes: [deckShape()] }), 'pool.size.buildable')).toBeUndefined()
  })

  it('names the measurement rather than an internal field', () => {
    const item = runValidation(makeCtx({ shapes: [sized(99_999, 14)] })).items.find(
      (i) => i.id === 'pool.size.buildable',
    )
    expect(item?.message).toContain('99,999')
    expect(item?.message).not.toMatch(/poolLengthFt|width|p1/)
    expect(item?.field).toBe('Pool size')
  })

  it('flags a shallow end deeper than the deep end', () => {
    expect(
      level(makeCtx({ shapes: [poolShape({ shallow: 8, deep: 4 })] }), 'pool.depth.ordered'),
    ).toBe('error')
    expect(
      level(makeCtx({ shapes: [poolShape({ shallow: 3, deep: 5 })] }), 'pool.depth.ordered'),
    ).toBe('pass')
  })

  it('flags a depth no pool holds water at', () => {
    expect(
      level(makeCtx({ shapes: [poolShape({ shallow: 3, deep: 90 })] }), 'pool.depth.ordered'),
    ).toBe('error')
  })
})

describe('validation — required fields read the real keys', () => {
  it('customer name: error when blank, pass when set', () => {
    expect(level(makeCtx({ customerName: '' }), 'customer.name.required')).toBe('error')
    expect(level(makeCtx({ customerName: 'Jane' }), 'customer.name.required')).toBe('pass')
  })

  // Depth is read off the pool in the drawing, not off a second free-text copy
  // on the project. The old rule read `poolFields.depthShallow`, so the dock
  // demanded depths for a pool whose own inspector already read SH 3.0 / DP 5.0.
  it('pool depth: reads the drawn pool, not a typed copy', () => {
    expect(level(makeCtx({ shapes: [poolShape({ shallow: 0, deep: 0 })] }), 'pool.depth.required')).toBe(
      'error',
    )
    expect(level(makeCtx({ shapes: [poolShape({ shallow: 3, deep: 0 })] }), 'pool.depth.required')).toBe(
      'error',
    )
    expect(level(makeCtx({ shapes: [poolShape()] }), 'pool.depth.required')).toBe('pass')

    // Typing depths onto the project can no longer satisfy it, and no longer
    // needs to: there is one place depth lives.
    expect(
      level(
        makeCtx({ shapes: [poolShape({ shallow: 0, deep: 0 })], poolFields: { depthShallow: '3', depthDeep: '5' } }),
        'pool.depth.required',
      ),
    ).toBe('error')
  })

  it('pool depth: says nothing at all when there is no pool to have a depth', () => {
    // `pool.area.required` is the honest complaint about an empty canvas. A
    // second row about the depth of a pool that does not exist is noise.
    expect(level(makeCtx({ shapes: [deckShape()] }), 'pool.depth.required')).toBeUndefined()
  })

  it('interior finish: warn when blank, pass when set (interiorFinish key)', () => {
    expect(level(makeCtx({ poolFields: {} }), 'pool.interior.required')).toBe('warn')
    expect(
      level(makeCtx({ poolFields: { interiorFinish: 'Pebble' } }), 'pool.interior.required'),
    ).toBe('pass')
  })

  it('equipment package: warn when blank (equipmentPackage key)', () => {
    expect(level(makeCtx({ poolFields: {} }), 'equipment.pump.required')).toBe('warn')
    expect(
      level(makeCtx({ poolFields: { equipmentPackage: 'Standard' } }), 'equipment.pump.required'),
    ).toBe('pass')
  })

  it('sanitation: satisfied by a package or by the salt selection', () => {
    expect(level(makeCtx({ poolFields: {} }), 'equipment.sanitation.required')).toBe('warn')
    expect(
      level(makeCtx({ poolFields: { sanitizationPackage: 'UV' } }), 'equipment.sanitation.required'),
    ).toBe('pass')
    expect(
      level(makeCtx({ selections: { saltSelected: true } }), 'equipment.sanitation.required'),
    ).toBe('pass')
  })

  it('heater detail: warn only when a heater is selected without a model', () => {
    expect(level(makeCtx({ selections: { heaterSelected: false } }), 'heater.fuel.required')).toBe('pass')
    expect(level(makeCtx({ selections: { heaterSelected: true } }), 'heater.fuel.required')).toBe('warn')
    expect(
      level(
        makeCtx({ selections: { heaterSelected: true }, poolFields: { heaterSelection: 'Gas' } }),
        'heater.fuel.required',
      ),
    ).toBe('pass')
  })

  it('screen spec: warn only when a screen is selected without a spec', () => {
    expect(level(makeCtx({ selections: { screenSelected: true } }), 'screen.specs.required')).toBe('warn')
    expect(
      level(
        makeCtx({ selections: { screenSelected: true }, poolFields: { screenOption: 'Phifer' } }),
        'screen.specs.required',
      ),
    ).toBe('pass')
  })

  it('deck material: warn only when a deck is drawn without a material', () => {
    expect(level(makeCtx({ shapes: [poolShape()] }), 'deck.material.required')).toBe('pass')
    expect(level(makeCtx({ shapes: [poolShape(), deckShape()] }), 'deck.material.required')).toBe('warn')
    expect(
      level(
        makeCtx({ shapes: [poolShape(), deckShape()], poolFields: { deckMaterial: 'Paver' } }),
        'deck.material.required',
      ),
    ).toBe('pass')
  })
})

describe('validation — measurement-driven rules', () => {
  it('pool area error and zero-quote warning when nothing is drawn', () => {
    expect(level(makeCtx({ shapes: [] }), 'pool.area.required')).toBe('error')
    expect(level(makeCtx({ shapes: [] }), 'quote.total.zero')).toBe('warn')
  })
})

describe('validation — no synthetic theater rules remain', () => {
  it('the always-pass safety/code pills and synthetic setback are gone', () => {
    const ids = new Set(runValidation(makeCtx()).items.map((i) => i.id))
    for (const removed of [
      'safety.gfci',
      'safety.ground.bonding',
      'safety.drains.placed',
      'safety.perimeter.alarm',
      'pool.setback.rear',
      'pool.depth.marker.placed',
      'spillover.elevation',
      'equipment.heater.btu',
    ]) {
      expect(ids.has(removed)).toBe(false)
    }
  })
})

describe('validation — a complete project passes cleanly', () => {
  it('no errors or warnings when everything is populated', () => {
    const report = runValidation(makeCtx(FULLY_POPULATED))
    expect(report.counts.error).toBe(0)
    expect(report.counts.warn).toBe(0)
    expect(report.counts.pass).toBeGreaterThan(0)
  })
})


// The checklist prints `category · field` under every row and upper-cases it, so
// a schema path put in `field` reached the screen as `POOL · DEPTHSHALLOW` and
// `EXPORT · PROPOSALEXPIRESAT`. Both the global and the repo conventions say
// user-facing text never carries an internal identifier.
describe('checklist rows are written in English', () => {
  /** A project with nothing answered, which trips every field-bearing rule. */
  function bareCtx(): ValidationContext {
    return makeCtx({
      shapes: [poolShape({ shallow: 0, deep: 0 }), deckShape()],
      customerName: '',
      address: '',
      proposalExpiresAt: '',
      poolFields: {},
      selections: { heaterSelected: true, screenSelected: true },
    })
  }

  function emittedFields(): string[] {
    return runValidation(bareCtx())
      .items.map((item) => item.field)
      .filter((field): field is string => typeof field === 'string')
  }

  it('never prints an internal field key', () => {
    const fields = emittedFields()
    // Without this the sweep below would pass on an empty list.
    expect(fields.length).toBeGreaterThanOrEqual(6)

    for (const field of fields) {
      expect(field, `${field} looks like camelCase`).not.toMatch(/[a-z][A-Z]/)
      expect(field, `${field} is not capitalised like a sentence`).toMatch(/^[A-Z]/)
      expect(Object.values<string>(FIELD_LABELS)).toContain(field)
    }
  })

  it('says something different from the key it stands for', () => {
    // Guards the lazy fix, where a label is set to the key it replaced and the
    // row still reads PROPOSALEXPIRESAT once the dock upper-cases it.
    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      expect(label.toUpperCase()).not.toBe(key.toUpperCase())
    }
  })
})
