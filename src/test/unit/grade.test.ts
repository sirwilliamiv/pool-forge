// Site grading, end to end through the pieces that are not the pure model.
//
// The model has property tests; these cover the store, what earthwork does to a
// quote, and the rules a builder needs told before the shell goes in.

import { beforeEach, describe, expect, it } from 'vitest'

import { emptyGrade } from '@/modules/editor/grade/model'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { computeMeasurements, withEarthwork } from '@/modules/measurements/engine'
import { computeQuote, PriceCategory, UnitType } from '@/modules/pricing/engine'
import { runValidation } from '@/modules/validation/engine'

const BOUNDS = { x: 0, y: 0, width: 1_200, height: 1_200 }

function flat(elevationFt: number) {
  return { ...emptyGrade(), enabled: true, baseElevationFt: elevationFt }
}

describe('grade store', () => {
  beforeEach(() => {
    useGradeStore.setState({ existing: emptyGrade(), finished: emptyGrade(), editing: 'existing' })
  })

  it('starts flat and switched off, because most sites are', () => {
    expect(useGradeStore.getState().existing.enabled).toBe(false)
  })

  it('turns on when the first shot is recorded', () => {
    // Making someone enable it separately is a step with no decision in it.
    useGradeStore.getState().addPoint({ x: 0, y: 0, elevationFt: -3 })
    expect(useGradeStore.getState().existing.enabled).toBe(true)
  })

  it('edits the surface it was told to, not a mode it remembers', () => {
    useGradeStore.getState().setEditing('finished')
    useGradeStore.getState().addPoint({ x: 10, y: 10, elevationFt: -1 })
    expect(useGradeStore.getState().finished.points).toHaveLength(1)
    expect(useGradeStore.getState().existing.points).toHaveLength(0)
  })

  it('switches both surfaces together', () => {
    // One on and one off would report the whole site as cut the moment grading
    // was switched on.
    useGradeStore.getState().setEnabled(true)
    expect(useGradeStore.getState().existing.enabled).toBe(true)
    expect(useGradeStore.getState().finished.enabled).toBe(true)
  })

  it('clamps the blend so the field cannot oscillate', () => {
    useGradeStore.getState().setFalloff(0.1)
    expect(useGradeStore.getState().existing.falloff).toBeGreaterThanOrEqual(1)
    useGradeStore.getState().setFalloff(99)
    expect(useGradeStore.getState().existing.falloff).toBeLessThanOrEqual(6)
  })

  it('opens a drawing that has no grade at all', () => {
    // Every drawing made before grading existed. They have to open flat, not
    // throw.
    useGradeStore.getState().hydrate(null)
    expect(useGradeStore.getState().existing.enabled).toBe(false)
    expect(useGradeStore.getState().existing.points).toEqual([])
  })

  it('drops a stored elevation with no position', () => {
    useGradeStore.getState().hydrate({
      existing: { enabled: true, points: [{ elevationFt: 3 }] } as never,
      finished: null,
    })
    expect(useGradeStore.getState().existing.points).toHaveLength(0)
  })
})

describe('earthwork in the numbers', () => {
  it('is zero on a site nobody graded', () => {
    // The answer every existing project must still give.
    const measured = withEarthwork(computeMeasurements([]), null, BOUNDS)
    expect(measured.cutYards).toBe(0)
    expect(measured.fillYards).toBe(0)
  })

  it('reports a dig as cut, not as fill', () => {
    const measured = withEarthwork(
      computeMeasurements([]),
      { existing: flat(0), finished: flat(-2) },
      BOUNDS,
    )
    expect(measured.cutYards).toBeGreaterThan(0)
    expect(measured.fillYards).toBe(0)
  })

  it('prices cut by the cubic yard', () => {
    const measured = withEarthwork(
      computeMeasurements([]),
      { existing: flat(0), finished: flat(-2) },
      BOUNDS,
    )
    const quote = computeQuote(
      [
        {
          id: 'e1',
          name: 'Excavation and haul off',
          category: PriceCategory.EARTHWORK,
          unitType: UnitType.CUYD,
          retailPrice: 45,
        },
      ],
      measured,
      {},
    )
    expect(quote.lineItems).toHaveLength(1)
    expect(quote.lineItems[0]?.quantity).toBeCloseTo(measured.cutYards, 2)
    expect(quote.subtotal).toBeGreaterThan(0)
  })

  it('prices fill separately from cut', () => {
    // Different jobs at different rates: a yard out is haulage, a yard in is
    // material. A single netted line would bill one of them at the other's rate.
    const measured = withEarthwork(
      computeMeasurements([]),
      { existing: flat(0), finished: flat(2) },
      BOUNDS,
    )
    const quote = computeQuote(
      [
        { id: 'cut', name: 'Excavation', category: PriceCategory.EARTHWORK, unitType: UnitType.CUYD, retailPrice: 45 },
        { id: 'fill', name: 'Imported fill', category: PriceCategory.EARTHWORK, unitType: UnitType.CUYD, retailPrice: 62 },
      ],
      measured,
      {},
    )
    const fill = quote.lineItems.find(line => line.itemId === 'fill')
    expect(fill?.quantity).toBeCloseTo(measured.fillYards, 2)
    expect(quote.lineItems.find(line => line.itemId === 'cut')).toBeUndefined()
  })

  it('prices nothing when the site is flat', () => {
    const quote = computeQuote(
      [{ id: 'e1', name: 'Excavation', category: PriceCategory.EARTHWORK, unitType: UnitType.CUYD, retailPrice: 45 }],
      computeMeasurements([]),
      {},
    )
    expect(quote.lineItems).toHaveLength(0)
  })
})

describe('grading validation', () => {
  const project = { name: 'x', poolFields: {} }
  const selections = { heaterSelected: false, saltSelected: false, screenSelected: false }

  function report(measurements: ReturnType<typeof computeMeasurements>) {
    return runValidation({
      project: project as never,
      measurements,
      selections: selections as never,
      shapeCount: 1,
      hasDeck: false,
    })
  }

  it('says nothing about a flat site', () => {
    const items = report(computeMeasurements([])).items
    expect(items.some(item => item.id.startsWith('grade.'))).toBe(false)
  })

  it('warns about a fall you could not comfortably walk', () => {
    const measured = { ...computeMeasurements([]), maxSlopePct: 9 }
    const slope = report(measured).items.find(item => item.id === 'grade.slope.walkable')
    expect(slope?.level).toBe('warn')
  })

  it('escalates a fall that needs terracing', () => {
    // Above fifteen percent it is not a graded pad, and calling that a warning
    // would let it reach a customer as a drawing nobody can build.
    const measured = { ...computeMeasurements([]), maxSlopePct: 22 }
    const slope = report(measured).items.find(item => item.id === 'grade.slope.walkable')
    expect(slope?.level).toBe('error')
  })

  it('flags earthwork worth pricing before someone finds it on site', () => {
    const measured = { ...computeMeasurements([]), cutYards: 80, fillYards: 0 }
    expect(report(measured).items.some(item => item.id === 'grade.earthwork.priced')).toBe(true)
  })
})
