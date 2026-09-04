'use client'

import { useMemo } from 'react'

import { elevationAt, type SiteGrade } from '@/modules/editor/grade/model'
import { visibleBounds } from '@/modules/editor/placement'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
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
import { SketchPathObject } from './SketchPathObject'
import { HouseWall } from './objects/HouseWall'
import { LedLights } from './objects/LedLights'
import { Loungers } from './objects/Loungers'
import { PlanOverlay } from './PlanOverlay'
import { PolygonPool } from './objects/PolygonPool'
import { PropertyLine } from './objects/PropertyLine'
import { PoolWalls } from './objects/PoolWalls'
import { EllipsePool } from './objects/EllipsePool'
import { Spa } from './objects/Spa'
import { Spillover } from './objects/Spillover'
import { Steps } from './objects/Steps'
import { SunShelf } from './objects/SunShelf'
import { TileBand } from './objects/TileBand'
import { Terrain } from './objects/Terrain'
import { Trees } from './objects/Trees'
import { Water } from './objects/Water'

/**
 * How high an object stands, in scene units.
 *
 * Its own `elevationFt` on top of the ground beneath its centre. A flat site
 * leaves everything at zero, which is exactly where it used to be, so nothing
 * moves until somebody grades the site.
 */
function groundUnder(shape: Shape, grade: SiteGrade | null): number {
  const own = shape.elevationFt ?? 0
  if (!grade) return feet(own * 12)
  const centreX = shape.x + shape.width / 2
  const centreY = shape.y + shape.height / 2
  return feet((elevationAt(grade, centreX, centreY) + own) * 12)
}

/** Shapes a deck must be cut around: anything you would fall into. */
const CUT_INTO_DECK = new Set<ShapeKind>([
  ShapeKind.RECTANGLE_POOL,
  ShapeKind.POLYGON_POOL,
  ShapeKind.SPA,
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
          {/* Coping is the concrete border. It used to render unconditionally,
              so it belonged to no shape, had no id, and nothing could remove it:
              asked to take it off, the agent called a command that succeeded and
              the concrete stayed. Default on, because a real pool has coping. */}
          {shape.displayHint?.coping !== false && <Coping shape={shape} />}
          {shape.displayHint?.tileBand !== false && <TileBand shape={shape} />}
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
    case ShapeKind.SKETCH_PATH:
      return <SketchPathObject shape={shape} />
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

/**
 * Components that already place themselves from `shape.x` and `shape.y`.
 *
 * The rest draw at the scene origin and are placed by the wrapper below. Getting
 * this wrong is not a small error and does not look like a positioning bug: a
 * self-placing component inside a placed wrapper lands at roughly twice its
 * offset, so a tanning ledge asked for on a pool appears somewhere else
 * entirely, while its selection outline stays correctly on the pool. The object
 * looks missing and the outline looks like it is pointing at nothing.
 *
 * Listed explicitly, and checked by a test that reads the components, so a new
 * one cannot join the dispatch without declaring which kind it is.
 */
export const SELF_POSITIONED_STENCILS = new Set([
  ...STEPS_IDS,
  ...LIGHT_IDS,
  ...SUN_SHELF_IDS,
  ...SPA_IDS,
  ...BUBBLER_IDS,
  'site.house-wall',
  'site.tree',
  'site.lounger',
])

function renderStencilShape(shape: Shape) {
  if (shape.kind !== ShapeKind.STENCIL) return null
  const id = shape.stencilId

  // Site context, placed by the user rather than baked into the scene.
  if (id === 'site.tree') {
    // The shape goes in for the same reason as the wall: without it the group
    // carries no id and a tree somebody placed cannot be selected or moved.
    return <Trees shape={shape} trees={[{ x: 0, z: 0, scale: shape.width / 96 }]} />
  }
  if (id === 'site.lounger') {
    return (
      <Loungers
        shape={shape}
        loungers={[{ x: 0, z: 0, rotation: ((shape.rotation ?? 0) * Math.PI) / 180 }]}
      />
    )
  }
  // The lot line is a boundary, not an object: drawn on the ground, and never
  // as a solid box the size of the lot, which is what the generic stencil mesh
  // would have made of it.
  if (id === 'symbol.property-line') {
    return <PropertyLine shape={shape} />
  }
  if (id === 'site.house-wall') {
    // The shape goes in, which is what gives the wall an id. Without it the
    // group carries no `userData.id`, the picker walks past it, and the wall
    // cannot be selected, moved or resized: it is scenery rather than an object.
    return <HouseWall shape={shape} />
  }

  if (STEPS_IDS.has(id)) {
    // Bare: this one places itself from the shape.
    return <Steps shape={shape} />
  }
  if (BUBBLER_IDS.has(id)) {
    // Bare: this one places itself too.
    return <Bubblers shape={shape} />
  }
  if (LIGHT_IDS.has(id)) {
    // Bare: this one places itself from the shape.
    return <LedLights shape={shape} />
  }
  if (SUN_SHELF_IDS.has(id)) {
    // Bare: this one places itself from the shape.
    return <SunShelf shape={shape} />
  }
  if (SPA_IDS.has(id)) {
    // Bare: this one places itself from the shape.
    return <Spa shape={shape} />
  }
  return <GenericStencil shape={shape} />
}

export function SceneRoot() {
  const shapes = useShapesStore((s) => s.shapes)
  const flags = usePresentationFlags()
  const existing = useGradeStore((s) => s.existing)
  const finished = useGradeStore((s) => s.finished)

  // The ground the objects stand on. Sized to the drawing with a margin, so the
  // lawn reaches past the fence rather than stopping at the last object.
  const terrainBounds = useMemo(() => {
    const box = visibleBounds(shapes)
    const margin = 240
    if (!box) return { x: -600, y: -600, width: 1_200, height: 1_200 }
    return {
      x: box.x - margin,
      y: box.y - margin,
      width: box.width + margin * 2,
      height: box.height + margin * 2,
    }
  }, [shapes])

  const graded = finished.enabled || existing.enabled
  const surface = finished.enabled ? finished : existing

  return (
    <group name="scene-root">
      {graded && (
        <Terrain
          grade={surface}
          bounds={terrainBounds}
          existing={finished.enabled && existing.enabled ? existing : undefined}
        />
      )}
      {shapes.map((shape) =>
        shape.hidden ? null : (
          <group
            // Keyed by id alone. Folding width/height/rotation (and, for decks,
            // the cutout signature) into the key remounted the whole subtree on
            // every resize/rotate frame — disposing and rebuilding every mesh
            // 60-120x/sec during a drag. Each object already rebuilds its own
            // geometry reactively from its dimensions, and the deck refreshes
            // its cutout from a stable signature inside `Deck`, so nothing needs
            // a remount to stay current.
            key={shape.id}
            // Standing on the ground rather than at zero. The height is taken
            // at the object's centre, so a deck on a slope sits at the level of
            // its middle rather than tilting with the lawn — which is what a
            // built deck does.
            position={[0, groundUnder(shape, graded ? surface : null), 0]}
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
