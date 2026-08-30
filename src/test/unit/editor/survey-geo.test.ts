/** @vitest-environment jsdom */

// The survey's satellite geo parameters, across their two seams.
//
// Seam one is `rootJson`: `parseDrawingPayload`/`serializeDrawingPayload` must
// round-trip `survey.geo` without loss, accept a survey that has geo and no
// uploaded image (its raster comes from the satellite proxy at view time), and
// drop geo that fails `surveyGeoSchema` rather than hand a corrupt zoom to the
// proxy route.
//
// Seam two is the `site.import.satellite` client handler: the server half
// echoes a payload, and the handler here must write the survey store the way
// the renderer and the calibration readout expect, or refuse a malformed echo.

import { createElement } from 'react'

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { dispatch } from '@/lib/commands/dispatch'
import {
  parseDrawingPayload,
  parseSurvey,
  serializeDrawingPayload,
} from '@/modules/editor/drawing-payload'
import { useSurveyStore, type SurveyConfig } from '@/modules/editor/state/surveyStore'
import type { SatelliteImportPayload } from '@/modules/site/geo/types'

const GEO = { lat: 27.9506, lng: -82.4572, zoom: 20, mapWidthPx: 640, mapHeightPx: 640 }

/** A satellite-backed survey: no uploaded image, geo present. */
function satelliteSurvey(): SurveyConfig {
  return {
    sourceImageId: '',
    x: -384,
    y: -384,
    widthInches: 768,
    heightInches: 768,
    opacity: 0.9,
    locked: true,
    calibrationPxDistance: 100,
    calibrationRealInches: 120,
    imageNaturalWidthPx: 1280,
    imageNaturalHeightPx: 1280,
    geo: { ...GEO },
  }
}

describe('drawing payload round-trips survey.geo', () => {
  it('preserves geo through serialize then parse', () => {
    const serialized = serializeDrawingPayload({ shapes: [], survey: satelliteSurvey() })
    const back = parseDrawingPayload(serialized)
    expect(back.survey).not.toBeNull()
    expect(back.survey?.geo).toEqual(GEO)
    expect(back.survey?.sourceImageId).toBe('')
    expect(back.survey?.widthInches).toBe(768)
  })

  it('a survey with geo and no sourceImageId is valid', () => {
    const parsed = parseSurvey({ ...satelliteSurvey() })
    expect(parsed).not.toBeNull()
    expect(parsed?.geo).toEqual(GEO)
  })

  it('an uploaded survey without geo round-trips with no geo key', () => {
    const uploaded: SurveyConfig = {
      sourceImageId: 'img_1',
      x: 0,
      y: 0,
      widthInches: 600,
      heightInches: 400,
      opacity: 0.5,
      locked: false,
      calibrationPxDistance: 50,
      calibrationRealInches: 60,
      imageNaturalWidthPx: 3000,
      imageNaturalHeightPx: 2000,
    }
    const serialized = serializeDrawingPayload({ shapes: [], survey: uploaded })
    expect(serialized.survey).not.toBeNull()
    expect('geo' in (serialized.survey as Record<string, unknown>)).toBe(false)
    const back = parseDrawingPayload(serialized)
    expect(back.survey?.geo).toBeUndefined()
    expect(back.survey?.sourceImageId).toBe('img_1')
  })

  it('drops invalid geo but keeps a survey that still has an image', () => {
    const parsed = parseSurvey({
      ...satelliteSurvey(),
      sourceImageId: 'img_2',
      geo: { ...GEO, zoom: 99 },
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.geo).toBeUndefined()
    expect(parsed?.sourceImageId).toBe('img_2')
  })

  it('rejects a survey whose only claim is invalid geo', () => {
    const parsed = parseSurvey({ ...satelliteSurvey(), geo: { lat: 27.95 } })
    expect(parsed).toBeNull()
  })

  it('tolerates geo of the wrong type entirely', () => {
    const parsed = parseSurvey({ ...satelliteSurvey(), geo: 'not-an-object' })
    expect(parsed).toBeNull()
  })
})

describe('drawing payload round-trips survey.importedBuildingShapeId', () => {
  it('preserves the id through serialize then parse', () => {
    const survey: SurveyConfig = { ...satelliteSurvey(), importedBuildingShapeId: 'site-building-1' }
    const back = parseDrawingPayload(serializeDrawingPayload({ shapes: [], survey }))
    expect(back.survey?.importedBuildingShapeId).toBe('site-building-1')
    expect(back.survey?.geo).toEqual(GEO)
  })

  it('keeps a survey whose only claim is the imported building id', () => {
    // A building imported before any backdrop exists still has to be
    // remembered, or the next import stacks a second house.
    const parsed = parseSurvey({ sourceImageId: '', importedBuildingShapeId: 'site-building-2' })
    expect(parsed).not.toBeNull()
    expect(parsed?.importedBuildingShapeId).toBe('site-building-2')
  })

  it('tolerates absence and drops a non-string id', () => {
    expect(parseSurvey({ ...satelliteSurvey() })?.importedBuildingShapeId).toBeUndefined()
    expect(
      parseSurvey({ ...satelliteSurvey(), importedBuildingShapeId: 42 })?.importedBuildingShapeId,
    ).toBeUndefined()

    // A survey that never had the id serialises without the key.
    const serialized = serializeDrawingPayload({ shapes: [], survey: satelliteSurvey() })
    expect('importedBuildingShapeId' in (serialized.survey as Record<string, unknown>)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

const PAYLOAD: SatelliteImportPayload = {
  geo: { ...GEO },
  widthInches: 771.4,
  heightInches: 771.4,
  xInches: -385.5,
  yInches: -385.5,
  inchesPerPixel: 1.2053,
}

function stubServer(data: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data }),
    })),
  )
}

describe('site.import.satellite client handler', () => {
  beforeEach(() => {
    useSurveyStore.setState({ survey: null, calibrationMode: false })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useSurveyStore.setState({ survey: null, calibrationMode: false })
  })

  it('writes the survey store from a valid payload', async () => {
    stubServer(PAYLOAD)
    const view = render(createElement(ClientCommandHandlers))
    try {
      const result = await dispatch('site.import.satellite', { projectId: 'p1' })
      expect(result.ok).toBe(true)

      const survey = useSurveyStore.getState().survey
      expect(survey).not.toBeNull()
      expect(survey?.sourceImageId).toBe('')
      expect(survey?.x).toBe(PAYLOAD.xInches)
      expect(survey?.y).toBe(PAYLOAD.yInches)
      expect(survey?.widthInches).toBe(PAYLOAD.widthInches)
      expect(survey?.heightInches).toBe(PAYLOAD.heightInches)
      expect(survey?.geo).toEqual(GEO)
      expect(survey?.opacity).toBeCloseTo(0.9)
      expect(survey?.locked).toBe(true)
      // The calibration readout's provenance: N px = N * inchesPerPixel inches.
      expect(survey?.calibrationPxDistance).toBe(100)
      expect(survey?.calibrationRealInches).toBeCloseTo(100 * PAYLOAD.inchesPerPixel)
      // scale=2 doubles the raster over the requested map size.
      expect(survey?.imageNaturalWidthPx).toBe(GEO.mapWidthPx * 2)
      expect(survey?.imageNaturalHeightPx).toBe(GEO.mapHeightPx * 2)
    } finally {
      view.unmount()
    }
  })

  it('refuses a malformed server echo and leaves the store alone', async () => {
    stubServer({ ...PAYLOAD, geo: { lat: 27.95 } })
    const view = render(createElement(ClientCommandHandlers))
    try {
      const result = await dispatch('site.import.satellite', { projectId: 'p1' })
      expect(result.ok).toBe(false)
      expect(useSurveyStore.getState().survey).toBeNull()
    } finally {
      view.unmount()
    }
  })

  it('the written survey survives the rootJson round trip', async () => {
    stubServer(PAYLOAD)
    const view = render(createElement(ClientCommandHandlers))
    try {
      await dispatch('site.import.satellite', { projectId: 'p1' })
      const survey = useSurveyStore.getState().survey
      const back = parseDrawingPayload(serializeDrawingPayload({ shapes: [], survey }))
      expect(back.survey).toEqual(survey)
    } finally {
      view.unmount()
    }
  })
})
