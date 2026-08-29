/** @vitest-environment jsdom */

// The site plan, judged as the document a plan checker receives.
//
// It stamped itself "SITE PLAN — FOR PERMIT SUBMISSION" while carrying no
// property line, no house, no north arrow, no scale bar and no dimensions, with
// `Front: — Side: — Rear: —`, `Jurisdiction: —` and `Parcel ID: —` in the
// boxes that decide whether the packet is accepted. A rejected packet costs the
// builder weeks.
//
// Every assertion here is against the rendered sheet.

import { ShapeKind } from '@prisma/client'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SitePlanDocument } from '@/components/exports/SitePlanDocument'
import { PROPERTY_LINE_STENCIL, STRUCTURE_STENCIL } from '@/modules/editor/site/model'
import type { Shape } from '@/modules/editor/state/shapes'
import type { MeasurementSummary } from '@/modules/measurements/engine'

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
  spaCount: 0,
  lightCount: 0,
  waterFeatureCount: 0,
  hasPool: true,
  hasDeck: true,
  cutYards: 0,
  fillYards: 0,
  maxSlopePct: 0,
}

const PROJECT = {
  id: 'cmt000000000000000project',
  name: 'Alvarez Residence',
  salesperson: 'Ray',
  designer: 'Dani',
  internalNotes: null,
  poolFields: {},
  createdAt: new Date('2026-08-22T12:00:00Z'),
}

const CUSTOMER = {
  name: 'Mrs Alvarez',
  email: 'maria@example.com',
  phone: '813-555-0142',
  address: '4127 Bayshore Ct, Tampa FL 33611',
}

function pool(x = 20 * 12, y = 20 * 12): Shape {
  return {
    id: 'pool-1',
    kind: ShapeKind.RECTANGLE_POOL,
    x,
    y,
    width: 25 * 12,
    height: 12 * 12,
    rotation: 0,
    zIndex: 2,
    locked: false,
    hidden: false,
    depthShallow: 3,
    depthDeep: 5,
  }
}

function lot(limits?: { frontFt?: number; sideFt?: number; rearFt?: number; easements?: string }): Shape {
  const shape: Shape = {
    id: 'lot-1',
    kind: ShapeKind.STENCIL,
    stencilId: PROPERTY_LINE_STENCIL,
    x: 0,
    y: 0,
    width: 80 * 12,
    height: 110 * 12,
    rotation: 0,
    zIndex: 0,
    locked: false,
    hidden: false,
  }
  if (limits) shape.displayHint = { lot: limits }
  return shape
}

function house(): Shape {
  return {
    id: 'house-1',
    kind: ShapeKind.STENCIL,
    stencilId: STRUCTURE_STENCIL,
    x: 10 * 12,
    y: -24 * 12,
    width: 40 * 12,
    height: 24 * 12,
    rotation: 0,
    zIndex: 1,
    locked: false,
    hidden: false,
    name: 'House',
  }
}

function renderSheet(
  shapes: Shape[],
  permit?: { jurisdiction?: string | null; parcelId?: string | null },
) {
  return render(
    <SitePlanDocument
      project={PROJECT}
      customer={CUSTOMER}
      shapes={shapes}
      measurements={MEASUREMENTS}
      jurisdiction={permit?.jurisdiction ?? null}
      parcelId={permit?.parcelId ?? null}
    />,
  )
}

describe('a sheet with nothing recorded', () => {
  it('does not claim to be submittable', () => {
    renderSheet([pool()])
    expect(screen.getByText(/not ready for permit submission/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Ready for permit submission$/i)).not.toBeInTheDocument()
  })

  it('names every missing thing, rather than printing a dash for it', () => {
    renderSheet([pool()])
    const banner = screen.getByText(/^Missing:/).textContent ?? ''
    expect(banner).toContain('property line')
    expect(banner).toContain('house')
    expect(banner).toContain('required setbacks')
    expect(banner).toContain('jurisdiction')
    expect(banner).toContain('parcel ID')
  })

  it('says why the setback table is empty', () => {
    renderSheet([pool()])
    expect(
      screen.getByText(/No property line has been drawn for this project/i),
    ).toBeInTheDocument()
  })

  it('prints the words rather than an em dash for the permit fields', () => {
    renderSheet([pool()])
    // "—" is indistinguishable from a field the software failed to fill.
    expect(screen.getAllByText('Not entered').length).toBeGreaterThan(0)
  })

  it('the footer does not stamp it for permit submission', () => {
    const { container } = renderSheet([pool()])
    const footer = container.querySelector('footer')?.textContent ?? ''
    expect(footer.toLowerCase()).toContain('draft, not for permit submission')
  })
})

describe('a sheet with the lot and the house recorded', () => {
  const complete = () => [lot({ frontFt: 25, sideFt: 5, rearFt: 7.5 }), house(), pool()]

  it('stamps itself ready only once everything is there', () => {
    renderSheet(complete(), { jurisdiction: 'Hillsborough County, FL', parcelId: '0412-3456' })
    expect(screen.getByText(/^Ready for permit submission$/i)).toBeInTheDocument()
  })

  it('prints the jurisdiction and parcel ID it was given', () => {
    renderSheet(complete(), { jurisdiction: 'Hillsborough County, FL', parcelId: '0412-3456' })
    expect(screen.getByText('Hillsborough County, FL')).toBeInTheDocument()
    expect(screen.getByText('0412-3456')).toBeInTheDocument()
  })

  it('prints the measured setback beside what the code requires', () => {
    renderSheet(complete(), { jurisdiction: 'Hillsborough County, FL', parcelId: '0412-3456' })
    const frontRow = screen.getByText('Front').closest('tr')!
    // Pool starts 20 ft back on a lot whose front line is the origin, against a
    // 25 ft requirement: the sheet has to say this does not meet it.
    expect(within(frontRow).getByText("20'")).toBeInTheDocument()
    expect(within(frontRow).getByText("25'")).toBeInTheDocument()
    expect(within(frontRow).getByText(/DOES NOT MEET/)).toBeInTheDocument()

    const leftRow = screen.getByText('Left side').closest('tr')!
    expect(within(leftRow).getByText('Meets')).toBeInTheDocument()
  })

  it('prints the distance to the structure that was placed', () => {
    renderSheet(complete())
    expect(screen.getByText(/20' to House/)).toBeInTheDocument()
  })

  it('says nothing about a limit nobody entered', () => {
    renderSheet([lot({ sideFt: 5 }), pool()])
    const frontRow = screen.getByText('Front').closest('tr')!
    expect(within(frontRow).getByText('Not entered')).toBeInTheDocument()
    expect(within(frontRow).getByText('No limit entered')).toBeInTheDocument()
  })
})

describe('the drawing on the sheet', () => {
  it('draws the property line and labels it', () => {
    const { container } = renderSheet([lot(), pool()])
    const texts = [...container.querySelectorAll('svg text')].map(node => node.textContent)
    expect(texts).toContain('PROPERTY LINE')
  })

  it('carries a north arrow and a real scale', () => {
    const { container } = renderSheet([lot(), pool()])
    const texts = [...container.querySelectorAll('svg text')].map(node => node.textContent ?? '')
    expect(texts).toContain('N')
    expect(texts.some(text => /1 in = \d+ ft/.test(text))).toBe(true)
  })

  it('dimensions the pool rather than leaving it to be scaled off the paper', () => {
    const { container } = renderSheet([lot(), pool()])
    const texts = [...container.querySelectorAll('svg text')].map(node => node.textContent ?? '')
    // 25 ft long, 12 ft wide.
    expect(texts).toContain("25'-0\"")
    expect(texts).toContain("12'-0\"")
  })

  it('scales itself to fit rather than overflowing the sheet border', () => {
    // The plan box printed at a fixed 760px inside a 720px column, so it hung
    // over the right-hand border of the sheet.
    const { container } = renderSheet([lot(), pool()])
    const svg = container.querySelector('section svg') as SVGElement
    expect(svg.getAttribute('width')).toBeNull()
    expect(svg.style.width).toBe('100%')
  })

  it('legend only claims the symbols this drawing carries', () => {
    renderSheet([pool()])
    expect(screen.queryByText('Property line')).not.toBeInTheDocument()
    expect(screen.queryByText('Existing structure')).not.toBeInTheDocument()

    renderSheet([lot({ sideFt: 5 }), house(), pool()])
    expect(screen.getByText('Property line')).toBeInTheDocument()
    expect(screen.getByText('Existing structure')).toBeInTheDocument()
    expect(screen.getByText('Required setback')).toBeInTheDocument()
  })
})
