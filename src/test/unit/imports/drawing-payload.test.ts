import { describe, expect, it } from 'vitest'

import {
  parseDrawingPayload,
  parseSurvey,
  serializeDrawingPayload,
} from '@/modules/editor/drawing-payload'

const SURVEY_FIELDS = {
  x: 0,
  y: 0,
  widthInches: 1200,
  heightInches: 900,
  opacity: 0.5,
  locked: false,
  calibrationPxDistance: 100,
  calibrationRealInches: 12,
  imageNaturalWidthPx: 2000,
  imageNaturalHeightPx: 1500,
}

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

describe('parseDrawingPayload: current shape', () => {
  it('reads a survey carrying a sourceImageId', () => {
    const payload = parseDrawingPayload({
      shapes: [],
      survey: { ...SURVEY_FIELDS, sourceImageId: 'img_123' },
    })
    expect(payload.survey?.sourceImageId).toBe('img_123')
    expect(payload.survey?.legacyImageDataUrl).toBeUndefined()
    expect(payload.survey?.opacity).toBe(0.5)
  })
})

describe('parseDrawingPayload: legacy data-URL shape', () => {
  it('still opens a pre-migration drawing and keeps its raster', () => {
    const payload = parseDrawingPayload({
      shapes: [],
      survey: { ...SURVEY_FIELDS, imageDataUrl: DATA_URL },
    })
    expect(payload.survey?.sourceImageId).toBe('')
    expect(payload.survey?.legacyImageDataUrl).toBe(DATA_URL)
    expect(payload.survey?.widthInches).toBe(1200)
  })

  it('does not leave the legacy key on the parsed object', () => {
    const payload = parseDrawingPayload({
      shapes: [],
      survey: { ...SURVEY_FIELDS, imageDataUrl: DATA_URL },
    })
    expect(payload.survey).not.toHaveProperty('imageDataUrl')
  })

  it('prefers the reference when a half-migrated row carries both', () => {
    const survey = parseSurvey({
      ...SURVEY_FIELDS,
      sourceImageId: 'img_123',
      imageDataUrl: DATA_URL,
    })
    expect(survey?.sourceImageId).toBe('img_123')
    expect(survey?.legacyImageDataUrl).toBe(DATA_URL)
  })
})

describe('parseDrawingPayload: absent or malformed', () => {
  it('returns an empty payload for junk', () => {
    expect(parseDrawingPayload(null)).toEqual({ shapes: [], survey: null })
    expect(parseDrawingPayload('nope')).toEqual({ shapes: [], survey: null })
    expect(parseDrawingPayload({})).toEqual({ shapes: [], survey: null })
  })

  it('returns a null survey when there is neither reference nor raster', () => {
    expect(parseSurvey({ ...SURVEY_FIELDS })).toBeNull()
    expect(parseSurvey({ ...SURVEY_FIELDS, sourceImageId: '' })).toBeNull()
    expect(parseSurvey(null)).toBeNull()
  })

  it('ignores a non-array shapes field', () => {
    expect(parseDrawingPayload({ shapes: 'nope' }).shapes).toEqual([])
  })
})

describe('serializeDrawingPayload', () => {
  it('writes sourceImageId and no data URL for a migrated survey', () => {
    const { survey } = serializeDrawingPayload({
      shapes: [],
      survey: { ...SURVEY_FIELDS, sourceImageId: 'img_123' },
    })
    expect(survey).toMatchObject({ sourceImageId: 'img_123' })
    expect(survey).not.toHaveProperty('imageDataUrl')
    expect(survey).not.toHaveProperty('legacyImageDataUrl')
  })

  it('round-trips an un-migrated raster rather than destroying it', () => {
    const loaded = parseDrawingPayload({
      shapes: [],
      survey: { ...SURVEY_FIELDS, imageDataUrl: DATA_URL },
    })
    const written = serializeDrawingPayload(loaded)
    expect(written.survey).toMatchObject({ imageDataUrl: DATA_URL })
    expect(written.survey).not.toHaveProperty('legacyImageDataUrl')
    expect(parseDrawingPayload(written).survey?.legacyImageDataUrl).toBe(DATA_URL)
  })

  it('passes a null survey through', () => {
    expect(serializeDrawingPayload({ shapes: [], survey: null })).toEqual({
      shapes: [],
      survey: null,
    })
  })
})
