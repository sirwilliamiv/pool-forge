import { describe, it, expect } from 'vitest'
import { buildSourceImageViews, formatAppliedAt, type ImageAnalysisRow } from '@/components/imports/session-view'

const IMAGES = [
  { id: 'cm0abc111', kind: 'SKETCH', widthPx: 1600, heightPx: 1200 },
  { id: 'cm0abc222', kind: 'SITE_PLAN', widthPx: 2400, heightPx: 1800 },
  { id: 'cm0abc333', kind: 'SKETCH', widthPx: 800, heightPx: 600 },
]

describe('source image views', () => {
  it('labels images by kind and position, never by id', () => {
    const views = buildSourceImageViews(
      ['cm0abc111', 'cm0abc222', 'cm0abc333'],
      IMAGES,
      [],
    )
    expect(views.map((v) => v.label)).toEqual(['Sketch 1', 'Site plan 1', 'Sketch 2'])
    for (const view of views) {
      expect(view.label).not.toContain(view.id)
    }
  })

  it('honours the order the session recorded', () => {
    const views = buildSourceImageViews(['cm0abc333', 'cm0abc111'], IMAGES, [])
    expect(views.map((v) => v.id)).toEqual(['cm0abc333', 'cm0abc111', 'cm0abc222'])
  })

  it('starts every stage at not-run', () => {
    const views = buildSourceImageViews(['cm0abc111'], [IMAGES[0]!], [])
    expect(views[0]?.stages.CLASSIFY.status).toBe('PENDING')
    expect(views[0]?.stages.EXTRACT.status).toBe('PENDING')
    expect(views[0]?.stages.CALIBRATE.status).toBe('PENDING')
  })

  it('takes the newest analysis row per stage, so a retry supersedes a failure', () => {
    const views = buildSourceImageViews(
      ['cm0abc111'],
      [IMAGES[0]!],
      [
        {
          sourceImageId: 'cm0abc111',
          stage: 'EXTRACT',
          status: 'FAILED',
          errorRef: 'err_0123456789ab',
          createdAt: new Date('2026-08-19T10:00:00Z'),
        },
        {
          sourceImageId: 'cm0abc111',
          stage: 'EXTRACT',
          status: 'OK',
          errorRef: null,
          createdAt: new Date('2026-08-19T10:05:00Z'),
        },
        {
          sourceImageId: 'cm0abc111',
          stage: 'CLASSIFY',
          status: 'OK',
          errorRef: null,
          createdAt: new Date('2026-08-19T09:59:00Z'),
        },
      ],
    )
    expect(views[0]?.stages.EXTRACT.status).toBe('OK')
    expect(views[0]?.stages.EXTRACT.errorRef).toBeNull()
    expect(views[0]?.stages.CLASSIFY.status).toBe('OK')
  })

  it('keeps a failure and its correlation ref when that is the newest row', () => {
    const views = buildSourceImageViews(
      ['cm0abc111'],
      [IMAGES[0]!],
      [
        {
          sourceImageId: 'cm0abc111',
          stage: 'EXTRACT',
          status: 'FAILED',
          errorRef: 'err_0123456789ab',
          createdAt: new Date('2026-08-19T10:05:00Z'),
        },
      ],
    )
    expect(views[0]?.stages.EXTRACT.status).toBe('FAILED')
    expect(views[0]?.stages.EXTRACT.errorRef).toBe('err_0123456789ab')
  })

  it('ignores stages the review screen does not track', () => {
    const views = buildSourceImageViews(
      ['cm0abc111'],
      [IMAGES[0]!],
      [
        {
          sourceImageId: 'cm0abc111',
          stage: 'TRANSLATE',
          status: 'OK',
          errorRef: null,
          createdAt: new Date('2026-08-19T10:05:00Z'),
        },
      ],
    )
    expect(views[0]?.stages.CLASSIFY.status).toBe('PENDING')
  })
})

describe('applied date', () => {
  it('formats a date and passes null through', () => {
    expect(formatAppliedAt(null)).toBeNull()
    expect(formatAppliedAt(new Date('2026-08-19T15:00:00Z'))).toMatch(/2026/)
  })
})

// Calibration belongs to the session, not the image. Ingest dedupes identical
// bytes within an org, so two sessions share one SourceImage, and a calibration
// done in the first showed as Done in the second: a green check sitting
// directly above a banner saying the image has no scale.
describe('calibration status follows the session, not the image', () => {
  const CALIBRATED: ImageAnalysisRow[] = [
    {
      sourceImageId: 'cm0abc111',
      stage: 'CALIBRATE',
      status: 'OK',
      errorRef: null,
      createdAt: new Date('2026-08-19T20:48:20Z'),
    },
  ]

  it('reports PENDING when this session has no scale, despite a stale row', () => {
    const views = buildSourceImageViews(['cm0abc111'], [IMAGES[0]!], CALIBRATED, null)
    expect(views[0]?.stages.CALIBRATE.status).toBe('PENDING')
  })

  it('reports OK once this session has a scale', () => {
    const views = buildSourceImageViews(['cm0abc111'], [IMAGES[0]!], CALIBRATED, 1.34)
    expect(views[0]?.stages.CALIBRATE.status).toBe('OK')
  })

  it('reports OK from the session even with no analysis row at all', () => {
    const views = buildSourceImageViews(['cm0abc111'], [IMAGES[0]!], [], 2.5)
    expect(views[0]?.stages.CALIBRATE.status).toBe('OK')
  })

  it('treats a zero or negative scale as uncalibrated', () => {
    expect(buildSourceImageViews(['cm0abc111'], [IMAGES[0]!], [], 0)[0]?.stages.CALIBRATE.status).toBe('PENDING')
  })
})

// A run that classified the image and then stopped, because classification is
// what picks the extractor and it declined to pick one. The ledger has to say
// "skipped", not "not run": a product owner read three NOT RUN rows beside a
// finished Classify, was given no error and no explanation, and concluded the
// feature was simply broken.
describe('a pipeline that stopped after classify', () => {
  const UNROUTABLE = [{ id: 'cm0abc111', kind: 'UNKNOWN', widthPx: 600, heightPx: 400 }]
  const CLASSIFIED: ImageAnalysisRow[] = [
    {
      sourceImageId: 'cm0abc111',
      stage: 'CLASSIFY',
      status: 'OK',
      errorRef: null,
      createdAt: new Date('2026-08-23T00:51:22Z'),
    },
  ]

  it('marks the stages that never ran as blocked, and says where it stopped', () => {
    const view = buildSourceImageViews(['cm0abc111'], UNROUTABLE, CLASSIFIED)[0]
    expect(view?.stages.CLASSIFY.status).toBe('OK')
    expect(view?.stages.EXTRACT.status).toBe('BLOCKED')
    expect(view?.stages.CALIBRATE.status).toBe('BLOCKED')
    expect(view?.blocked?.afterStage).toBe('CLASSIFY')
    expect(view?.blocked?.headline).toMatch(/did not run/i)
  })

  it('leaves an image nobody has analysed yet alone', () => {
    const view = buildSourceImageViews(['cm0abc111'], UNROUTABLE, [])[0]
    expect(view?.blocked).toBeNull()
    expect(view?.stages.EXTRACT.status).toBe('PENDING')
  })

  it('leaves a routed image alone', () => {
    const view = buildSourceImageViews(['cm0abc111'], [IMAGES[0]!], CLASSIFIED)[0]
    expect(view?.blocked).toBeNull()
    expect(view?.stages.EXTRACT.status).toBe('PENDING')
  })

  it('does not overwrite a stage that did complete', () => {
    // A manual calibration on an unroutable image is a real result and keeps
    // its own status; only Extract, which truly never ran, is marked skipped.
    const view = buildSourceImageViews(['cm0abc111'], UNROUTABLE, CLASSIFIED, 1.2)[0]
    expect(view?.stages.CALIBRATE.status).toBe('OK')
    expect(view?.stages.EXTRACT.status).toBe('BLOCKED')
    expect(view?.blocked).not.toBeNull()
  })
})
