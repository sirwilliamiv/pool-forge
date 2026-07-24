import { describe, it, expect } from 'vitest'
import { ShapeKind } from '@prisma/client'
import { computeMeasurements } from '@/modules/measurements/engine'
import { runValidation } from '@/modules/validation/engine'
import type { ValidationContext, ValidationSelections } from '@/modules/validation/types'
import type { Shape } from '@/modules/editor/state/shapes'

// Coverage for the honest validation rules (synthetic always-pass/always-fail
// rules were removed). Every rule here reads real project/measurement/selection
// data.

function poolShape(): Shape {
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
    depthShallow: 3,
    depthDeep: 5,
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
    depthShallow: '3',
    depthDeep: '5',
    interiorFinish: 'Pebble',
    equipmentPackage: 'Standard',
    sanitizationPackage: 'Salt',
    deckMaterial: 'Paver',
    heaterSelection: 'Gas 400k',
    screenOption: 'Phifer SunScreen',
  },
  selections: { heaterSelected: true, screenSelected: true },
}

describe('validation — required fields read the real keys', () => {
  it('customer name: error when blank, pass when set', () => {
    expect(level(makeCtx({ customerName: '' }), 'customer.name.required')).toBe('error')
    expect(level(makeCtx({ customerName: 'Jane' }), 'customer.name.required')).toBe('pass')
  })

  it('pool depth: error when either depth is missing, pass when both set', () => {
    expect(level(makeCtx({ poolFields: {} }), 'pool.depth.required')).toBe('error')
    expect(
      level(makeCtx({ poolFields: { depthShallow: '3', depthDeep: '5' } }), 'pool.depth.required'),
    ).toBe('pass')
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
