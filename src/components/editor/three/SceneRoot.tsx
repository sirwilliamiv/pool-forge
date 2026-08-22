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
import { PolygonPool } from './objects/PolygonPool'
import { PoolWalls } from './objects/PoolWalls'
import { EllipsePool } from './objects/EllipsePool'
import { Spa } from './objects/Spa'
import { Spillover } from './objects/Spillover'
import { Steps } from './objects/Steps'
import { SunShelf } from './objects/SunShelf'
import { TileBand } from './objects/TileBand'
import { Trees } from './objects/Trees'
import { Water } from './objects/Water'

/** Shapes a deck must be cut around: anything you would fall into. */
const CUT_INTO_DECK = new Set<ShapeKind>([
  ShapeKind.RECTANGLE_POOL,
  ShapeKind.POLYGON_POOL,
  ShapeKind.SPA,
])

const DECK_KINDS = new Set<ShapeKind>([
  ShapeKind.CONCRETE_DECK,
  ShapeKind.PAVER_DECK,
  ShapeKind.GRASS_AREA,
])

interface DeckCutout {
  kind: 'rect' | 'circle'
  x: number
  z: number
  width?: number
  height?: number
  radius?: number
}

/**
 * Holes for the pools a deck sits over.
 *
 * `Deck` has always accepted cutouts; nothing ever computed any, so a deck laid
 * around a pool rendered as a solid slab straight over the water. That is what
 * a deck drawn large enough to surround a pool always is, and it is the first
 * thing the voice agent builds, so the pool simply vanished.
 */
export function cutoutsFor(deck: Shape, shapes: Shape[]): DeckCutout[] {
  const deckLeft = deck.x
  const deckTop = deck.y
  const cutouts: DeckCutout[] = []

  for (const other of shapes) {
    if (other.hidden || !CUT_INTO_DECK.has(other.kind)) continue

    // Only cut what actually overlaps: an unrelated spa across the yard would
    // otherwise punch a hole in open concrete.
    const overlaps =
      other.x < deckLeft + deck.width &&
      other.x + other.width > deckLeft &&
      other.y < deckTop + deck.height &&
      other.y + other.height > deckTop
    if (!overlaps) continue

    // Deck-local, since the mesh is built around the deck's own centre.
    const x = feet(other.x + other.width / 2 - (deckLeft + deck.width / 2))
    const z = feet(other.y + other.height / 2 - (deckTop + deck.height / 2))

    if (other.displayHint?.['poolShape'] === 'ellipse') {
      cutouts.push({ kind: 'circle', x, z, radius: feet(Math.max(other.width, other.height) / 2) })
    } else {
      cutouts.push({ kind: 'rect', x, z, width: feet(other.width), height: feet(other.height) })
    }
  }

  return cutouts
}

function renderShape(shape: Shape, shapes: Shape[]) {
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
    case ShapeKind.POLYGON_POOL:
      return <PolygonPool shape={shape} />
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
      return <Deck shape={shape} cutouts={cutoutsFor(shape, shapes)} />
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

  // Site context, placed by the user rather than baked into the scene.
  if (id === 'site.tree') {
    return (
      <group position={pos}>
        <Trees trees={[{ x: 0, z: 0, scale: shape.width / 96 }]} />
      </group>
    )
  }
  if (id === 'site.lounger') {
    return (
      <group position={pos}>
        <Loungers loungers={[{ x: 0, z: 0, rotation: ((shape.rotation ?? 0) * Math.PI) / 180 }]} />
      </group>
    )
  }
  if (id === 'site.house-wall') {
    // The wall reads its length from the shape, so a user can size it to the
    // house they are actually building against.
    return <HouseWall position={[cx, 7, cz]} size={[feet(shape.width), 14, feet(shape.height)]} />
  }

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

/**
 * Changes that alter where a hole goes.
 *
 * `Deck` memoises its geometry on the cutouts array, which is rebuilt every
 * render, so the key has to change when a pool moves or the deck keeps its
 * stale slab.
 */
function cutoutKey(shapes: Shape[]): string {
  return shapes
    .filter(shape => CUT_INTO_DECK.has(shape.kind) && !shape.hidden)
    .map(shape => `${shape.id}:${shape.x}:${shape.y}:${shape.width}:${shape.height}`)
    .join('|')
}

export function SceneRoot() {
  const shapes = useShapesStore((s) => s.shapes)
  const flags = usePresentationFlags()

  return (
    <group name="scene-root">
      {shapes.map((shape) =>
        shape.hidden ? null : (
          <group
            key={`${shape.id}-${shape.width}-${shape.height}-${shape.rotation ?? 0}-${
              DECK_KINDS.has(shape.kind) ? cutoutKey(shapes) : ''
            }`}
          >
            {renderShape(shape, shapes)}
          </group>
        ),
      )}

      {/*
        The house wall, trees and loungers used to render here unconditionally at
        fixed coordinates, so every project in the product looked identical and no
        user could move or remove them. They are catalog stencils now
        (`site.tree`, `site.lounger`, `site.house-wall`), placed like anything
        else and listed in Layers.

        The decorative equipment pad went the same way: it is a real quoted line
        item, and drawing one as scenery on a job that has not got one is worse
        than drawing nothing.
      */}

      {flags.showPlanOverlay ? <PlanOverlay /> : null}
      {flags.showConstructionOverlay ? <BuildOverlay /> : null}
    </group>
  )
}
