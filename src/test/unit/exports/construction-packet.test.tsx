/** @vitest-environment jsdom */

// The construction packet, judged as the sheet a crew carries to site.
//
// CONSTRUCTION LAYOUT was the identical glossy blue gradient pool from the
// customer proposal: no dimensions, no centre lines, no equipment pad, no
// property line. Under it sat a SYMBOL LEGEND naming eight symbols — equipment
// pad, access arrow, property line, setback line, centre line, dimension line,
// approval block, notes block — none of which were on the drawing. A legend
// that describes a different drawing sends a crew looking for information that
// was never there.
//
// Two hardcoded defaults were also printed as though they had been specified:
// `Spa shape: Square (default)` and `Material: Phifer SunScreen (default)`.

import { ShapeKind } from '@prisma/client'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConstructionDocument } from '@/components/exports/ConstructionDocument'
import {
  EQUIPMENT_PAD_STENCIL,
  PROPERTY_LINE_STENCIL,
  STRUCTURE_STENCIL,
} from '@/modules/editor/site/model'
import type { Shape } from '@/modules/editor/state/shapes'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import type { QuoteSummary } from '@/modules/pricing/engine'

const MEASUREMENTS: MeasurementSummary = {
  poolSurfaceArea: 300,
  poolPerimeter: 74,
  poolGallons: 13_500,
  poolWettedArea: 596,
  poolLengthFt: 25,
  poolWidthFt: 12,
  poolDepthShallow: 3,
  poolDepthDeep: 5,
  poolAvgDepth: 4,
  deckArea: 770,
  copingLinearFeet: 74,
  decoDrainLinearFeet: 0,
  benchLinearFeet: 0,
  featureCount: 0,
  spaCount: 1,
  lightCount: 0,
  waterFeatureCount: 0,
  hasPool: true,
  hasDeck: true,
  cutYards: 0,
  fillYards: 0,
  maxSlopePct: 0,
}

const QUOTE: QuoteSummary = {
  status: 'PRICED',
  lineItems: [],
  subtotal: 0,
  taxRatePct: 6,
  taxAmount: 0,
  total: 0,
  unpriced: [],
}

function stencil(id: string, stencilId: string, x: number, y: number, w: number, h: number): Shape {
  return {
    id,
    kind: ShapeKind.STENCIL,
    stencilId,
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
  }
}

const POOL: Shape = {
  id: 'pool-1',
  kind: ShapeKind.RECTANGLE_POOL,
  x: 20 * 12,
  y: 20 * 12,
  width: 25 * 12,
  height: 12 * 12,
  rotation: 0,
  zIndex: 2,
  locked: false,
  hidden: false,
  depthShallow: 3,
  depthDeep: 5,
}

const SPA: Shape = {
  id: 'spa-1',
  kind: ShapeKind.SPA,
  x: 48 * 12,
  y: 20 * 12,
  width: 9 * 12,
  height: 6 * 12,
  rotation: 0,
  zIndex: 3,
  locked: false,
  hidden: false,
}

function renderPacket(shapes: Shape[], poolFields: Record<string, unknown> = {}) {
  return render(
    <ConstructionDocument
      project={{
        id: 'cmt000000000000000project',
        jobNumber: 104,
        name: 'Alvarez Residence',
        salesperson: 'Ray',
        designer: 'Dani',
        internalNotes: null,
        poolFields,
        createdAt: new Date('2026-08-22T12:00:00Z'),
      }}
      customer={{ name: 'Mrs Alvarez', email: null, phone: null, address: null }}
      shapes={shapes}
      measurements={MEASUREMENTS}
      quote={QUOTE}
      pageSize="tabloid"
    />,
  )
}

describe('the symbol legend describes the drawing it is printed on', () => {
  it('does not claim a property line, a setback line or an equipment pad that is not drawn', () => {
    renderPacket([POOL])
    expect(screen.queryByText('Property line')).not.toBeInTheDocument()
    expect(screen.queryByText('Required setback')).not.toBeInTheDocument()
    expect(screen.queryByText('Equipment pad')).not.toBeInTheDocument()
    expect(screen.queryByText('Existing structure')).not.toBeInTheDocument()
  })

  it('claims each of them exactly when the drawing carries it', () => {
    renderPacket([
      stencil('lot-1', PROPERTY_LINE_STENCIL, 0, 0, 80 * 12, 110 * 12),
      stencil('house-1', STRUCTURE_STENCIL, 10 * 12, -24 * 12, 40 * 12, 24 * 12),
      stencil('pad-1', EQUIPMENT_PAD_STENCIL, 60 * 12, 60 * 12, 8 * 12, 6 * 12),
      POOL,
    ])
    expect(screen.getByText('Property line')).toBeInTheDocument()
    expect(screen.getByText('Existing structure')).toBeInTheDocument()
    expect(screen.getByText('Equipment pad')).toBeInTheDocument()
    expect(screen.getByText('Plumbing run (route on site)')).toBeInTheDocument()
    // No zoning limit was entered, so the envelope is not drawn and not claimed.
    expect(screen.queryByText('Required setback')).not.toBeInTheDocument()
  })

  it('always claims the centre lines, north arrow and scale it always draws', () => {
    renderPacket([POOL])
    expect(screen.getByText('Centre line')).toBeInTheDocument()
    expect(screen.getByText('North arrow')).toBeInTheDocument()
    expect(screen.getByText('Graphic scale')).toBeInTheDocument()
  })
})

describe('the construction layout is a plan, not a render', () => {
  it('dimensions the pool', () => {
    const { container } = renderPacket([POOL])
    const texts = [...container.querySelectorAll('svg text')].map(node => node.textContent ?? '')
    expect(texts).toContain("25'-0\"")
    expect(texts).toContain("12'-0\"")
  })

  it('draws no sales gradient', () => {
    const { container } = renderPacket([POOL])
    expect(container.querySelector('linearGradient')).toBeNull()
    expect(container.querySelector('feDropShadow')).toBeNull()
  })

  it('says where the equipment pad is, or that there is not one', () => {
    renderPacket([POOL])
    expect(screen.getByText(/No equipment pad has been placed/i)).toBeInTheDocument()

    renderPacket([POOL, stencil('pad-1', EQUIPMENT_PAD_STENCIL, 60 * 12, 60 * 12, 8 * 12, 6 * 12)])
    expect(screen.getByText(/Equipment pad is located on the layout above/i)).toBeInTheDocument()
  })

  it('prints the setting-out setbacks, or says the lot line is missing', () => {
    renderPacket([POOL])
    expect(screen.getByText(/No property line has been drawn for this project/i)).toBeInTheDocument()

    renderPacket([stencil('lot-1', PROPERTY_LINE_STENCIL, 0, 0, 80 * 12, 110 * 12), POOL])
    expect(screen.getByText('Left side')).toBeInTheDocument()
  })
})

describe('nothing is printed as a spec that was never chosen', () => {
  it('reads the spa off the drawing instead of printing "Square (default)"', () => {
    renderPacket([POOL, SPA])
    expect(screen.queryByText(/Square \(default\)/)).not.toBeInTheDocument()
    expect(screen.getByText(/9.0 × 6.0 ft/)).toBeInTheDocument()
    expect(screen.getByText(/Rectangular/)).toBeInTheDocument()
  })

  it('does not order a screen mesh nobody selected', () => {
    renderPacket([POOL], { screenSelected: true, screenOption: 'Full cage' })
    expect(screen.queryByText(/Phifer SunScreen/)).not.toBeInTheDocument()
    expect(screen.getByText('Not specified')).toBeInTheDocument()
  })

  it('marks the default reinforcement as not engineered', () => {
    renderPacket([POOL])
    expect(screen.getByText(/NOT an engineered design/)).toBeInTheDocument()
  })
})
