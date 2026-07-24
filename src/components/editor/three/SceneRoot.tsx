'use client'

import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { usePresentationFlags } from '@/modules/editor/state/viewStore'
import { type Shape, ShapeKind } from '@/modules/editor/state/shapes'

import { feet } from '@/lib/three/units'

import { BuildOverlay } from './BuildOverlay'
import { Bubblers } from './objects/Bubblers'
import { Coping } from './objects/Coping'
import { Deck } from './objects/Deck'
import { EquipmentPad } from './objects/EquipmentPad'
import { GenericStencil } from './objects/GenericStencil'
import { HouseWall } from './objects/HouseWall'
import { LedLights } from './objects/LedLights'
import { Loungers } from './objects/Loungers'
import { PlanOverlay } from './PlanOverlay'
import { PoolWalls } from './objects/PoolWalls'
import { EllipsePool } from './objects/EllipsePool'
import { Spa } from './objects/Spa'
import { Spillover } from './objects/Spillover'
import { Steps } from './objects/Steps'
import { SunShelf } from './objects/SunShelf'
import { TileBand } from './objects/TileBand'
import { Trees } from './objects/Trees'
import { Water } from './objects/Water'

function renderShape(shape: Shape) {
  switch (shape.kind) {
    case ShapeKind.RECTANGLE_POOL:
      return shape.displayHint?.poolShape === 'ellipse' ? (
        <EllipsePool shape={shape} />
      ) : (
        <>
          <PoolWalls shape={shape} />
          <Water shape={shape} />
          <Coping shape={shape} />
          <TileBand shape={shape} />
        </>
      )
    case ShapeKind.SUN_SHELF:
      return <SunShelf shape={shape} />
    case ShapeKind.BENCH:
      return <SunShelf shape={shape} />
    case ShapeKind.SPA:
      return (
        <>
          <Spa shape={shape} />
          <Spillover shape={shape} />
        </>
      )
    case ShapeKind.CONCRETE_DECK:
    case ShapeKind.PAVER_DECK:
    case ShapeKind.GRASS_AREA:
      return <Deck shape={shape} />
    case ShapeKind.STENCIL:
      return renderStencilShape(shape)
  }
}

const STEPS_IDS = new Set([
  'pool.standard-steps',
  'pool.one-step',
  'pool.step-sets',
  'pool.corner-steps',
  'pool.square-steps',
])
const BUBBLER_IDS = new Set(['feature.bubblers', 'feature.deck-jets'])
const LIGHT_IDS = new Set(['feature.light'])
const SUN_SHELF_IDS = new Set(['feature.sun-shelf', 'feature.tanning-ledge'])
const SPA_IDS = new Set(['pool.spa'])

function renderStencilShape(shape: Shape) {
  if (shape.kind !== ShapeKind.STENCIL) return null
  const id = shape.stencilId
  // Position dispatched components via a positioned wrapper, since the existing
  // object components draw at scene origin. GenericStencil positions itself.
  const cx = feet(shape.x + shape.width / 2)
  const cz = feet(shape.y + shape.height / 2)
  const pos: [number, number, number] = [cx, 0, cz]

  if (STEPS_IDS.has(id)) {
    return (
      <group position={pos}>
        <Steps shape={shape} />
      </group>
    )
  }
  if (BUBBLER_IDS.has(id)) {
    return (
      <group position={pos}>
        <Bubblers shape={shape} />
      </group>
    )
  }
  if (LIGHT_IDS.has(id)) {
    return (
      <group position={pos}>
        <LedLights shape={shape} />
      </group>
    )
  }
  if (SUN_SHELF_IDS.has(id)) {
    return (
      <group position={pos}>
        <SunShelf shape={shape} />
      </group>
    )
  }
  if (SPA_IDS.has(id)) {
    return (
      <group position={pos}>
        <Spa shape={shape} />
      </group>
    )
  }
  return <GenericStencil shape={shape} />
}

export function SceneRoot() {
  const shapes = useShapesStore((s) => s.shapes)
  const flags = usePresentationFlags()

  return (
    <group name="scene-root">
      {shapes.map((shape) =>
        shape.hidden ? null : (
          <group
            key={`${shape.id}-${shape.width}-${shape.height}-${shape.rotation ?? 0}`}
          >
            {renderShape(shape)}
          </group>
        ),
      )}

      {flags.showSiteContext ? (
        <>
          <HouseWall position={[0, 7, -28]} />
          <Trees />
          <Loungers />
        </>
      ) : null}

      {flags.showEquipmentPad ? <EquipmentPad position={[24, 0, -22]} /> : null}

      {flags.showPlanOverlay ? <PlanOverlay /> : null}
      {flags.showConstructionOverlay ? <BuildOverlay /> : null}
    </group>
  )
}
