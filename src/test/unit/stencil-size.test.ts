// The size on the card and the size you get.
//
// A tester picked "Standard rectangle", labelled 30' x 14', and measured what
// landed: 25' x 12'. He reported it as stencils placing about 15% small. It is
// not a scale factor. The catalogue was consulted only for stencils with no
// dedicated shape kind, so the generic ones were right and pools, spas,
// shelves, benches and decks each silently got a different default from a
// second table. Those are the objects the whole drawing is made of.

import { beforeEach, describe, expect, it } from 'vitest'

import { STENCILS } from '@/modules/editor/stencils'
import { ShapeKind } from '@/modules/editor/stencils/types'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

function inchesOf(stencil: (typeof STENCILS)[number]): { width: number; height: number } {
  const factor = stencil.defaultDimensions.unit === 'ft' ? 12 : 1
  return {
    width: stencil.defaultDimensions.width * factor,
    height: stencil.defaultDimensions.height * factor,
  }
}

describe('what a stencil drops', () => {
  beforeEach(() => {
    useShapesStore.getState().clear()
  })

  it('found the catalogue', () => {
    // Guards the guard: an empty catalogue would pass every case below.
    expect(STENCILS.length).toBeGreaterThan(20)
  })

  it('is the size the card advertises, for every stencil in the catalogue', () => {
    const wrong: string[] = []

    for (const stencil of STENCILS) {
      const store = useShapesStore.getState()
      const kind = (stencil.shapeKind as ShapeKind | undefined) ?? ShapeKind.STENCIL
      const id = store.addShape(kind, 0, 0, { stencilId: stencil.id })
      const shape = useShapesStore.getState().shapes.find(s => s.id === id)
      const want = inchesOf(stencil)

      if (!shape || shape.width !== want.width || shape.height !== want.height) {
        wrong.push(
          `${stencil.name} (${stencil.id}): card says ${want.width}x${want.height}in, placed ${shape?.width}x${shape?.height}in`,
        )
      }
    }

    expect(wrong, `stencils that place at a different size than their label:\n${wrong.join('\n')}`).toEqual([])
  })

  it('still lets a caller ask for a size', () => {
    // Import and voice both place shapes at a measured size; the catalogue is
    // the default, not an override.
    const id = useShapesStore
      .getState()
      .addShape(ShapeKind.RECTANGLE_POOL, 0, 0, { stencilId: 'pool.rectangle', width: 480, height: 240 })
    const shape = useShapesStore.getState().shapes.find(s => s.id === id)
    expect(shape?.width).toBe(480)
    expect(shape?.height).toBe(240)
  })
})
