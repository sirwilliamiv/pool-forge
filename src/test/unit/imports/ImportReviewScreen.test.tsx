import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/lib/commands/dispatch', () => ({
  dispatch: vi.fn(async () => ({ ok: true, data: undefined })),
}))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { dispatch } from '@/lib/commands/dispatch'
import { ImportReviewScreen } from '@/components/imports/ImportReviewScreen'
import { analyzeButtonLabel } from '@/components/imports/ExtractionProgress'
import { UNROUTABLE_STOP } from '@/components/imports/types'
import { fieldDomId } from '@/components/imports/intent-fields'
import { emptyDesignIntent, type DesignIntent } from '@/modules/imports/intent'
import { PROJECT, reviewableIntent, sessionView } from './intent-fixture'

const dispatchMock = vi.mocked(dispatch)

function patchResult(intent: DesignIntent, touchedPaths: string[]) {
  return {
    ok: true as const,
    data: { sessionId: 'session_1', status: 'DRAFT' as const, intent, touchedPaths },
  }
}

beforeEach(() => {
  dispatchMock.mockReset()
  dispatchMock.mockResolvedValue({ ok: true, data: undefined })
  push.mockReset()
  refresh.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('editing a field', () => {
  it('dispatches import.intent.patch rather than only setting local state', async () => {
    const intent = reviewableIntent()
    const server: DesignIntent = { ...intent, pool: { ...intent.pool, lengthFt: 30 } }
    dispatchMock.mockResolvedValue(patchResult(server, ['pool.lengthFt']))

    render(<ImportReviewScreen project={PROJECT} session={sessionView(intent)} />)

    const input = screen.getByLabelText('Pool length') as HTMLInputElement
    expect(input.value).toBe('32')

    fireEvent.change(input, { target: { value: '30' } })
    await act(async () => {
      fireEvent.blur(input)
    })

    expect(dispatchMock).toHaveBeenCalledWith('import.intent.patch', {
      sessionId: 'session_1',
      patch: { pool: { lengthFt: 30 } },
    })
  })

  it('takes the displayed value from the command result, never from the keystrokes', async () => {
    const intent = reviewableIntent()
    // The server normalises to 31.5; a screen that trusted local state would
    // keep showing 30 and the audit log would disagree with the UI.
    const server: DesignIntent = { ...intent, pool: { ...intent.pool, lengthFt: 31.5 } }
    dispatchMock.mockResolvedValue(patchResult(server, ['pool.lengthFt']))

    render(<ImportReviewScreen project={PROJECT} session={sessionView(intent)} />)
    const input = screen.getByLabelText('Pool length') as HTMLInputElement
    fireEvent.change(input, { target: { value: '30' } })
    await act(async () => {
      fireEvent.blur(input)
    })

    expect(await screen.findByDisplayValue('31.5')).toBeInTheDocument()
  })

  it('dispatches a select correction through the same command', async () => {
    const intent = reviewableIntent()
    dispatchMock.mockResolvedValue(patchResult(intent, ['deck.material']))

    render(<ImportReviewScreen project={PROJECT} session={sessionView(intent)} />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Deck material'), {
        target: { value: 'travertine' },
      })
    })

    expect(dispatchMock).toHaveBeenCalledWith('import.intent.patch', {
      sessionId: 'session_1',
      patch: { deck: { material: 'travertine' } },
    })
  })

  it('does not dispatch when the value did not change', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    fireEvent.blur(screen.getByLabelText('Pool length'))
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('does not dispatch an unusable value', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    const input = screen.getByLabelText('Pool length')
    fireEvent.change(input, { target: { value: '-4' } })
    fireEvent.blur(input)
    expect(dispatchMock).not.toHaveBeenCalled()
    expect(screen.getByText('That value is not usable here, so nothing was saved.')).toBeInTheDocument()
  })
})

describe('the unreviewed field list', () => {
  it('names every blocking field and how many there are', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    const queue = screen.getByRole('region', { name: 'Fields needing review' })
    expect(within(queue).getByText('2 fields need your review')).toBeInTheDocument()
    expect(within(queue).getByText('Deck material')).toBeInTheDocument()
    expect(within(queue).getByText('Deep depth')).toBeInTheDocument()
    expect(within(queue).getByText('deck material, deep depth')).toBeInTheDocument()
  })

  it('shrinks as fields are reviewed and clears entirely when none are left', () => {
    render(
      <ImportReviewScreen
        project={PROJECT}
        session={sessionView(reviewableIntent(), { touchedFieldPaths: ['deck.material'] })}
      />,
    )
    expect(screen.getByText('1 field needs your review')).toBeInTheDocument()

    cleanup()
    render(
      <ImportReviewScreen
        project={PROJECT}
        session={sessionView(reviewableIntent(), {
          touchedFieldPaths: ['deck.material', 'pool.depthDeepFt'],
        })}
      />,
    )
    expect(
      screen.getByText(
        'All 2 low-confidence fields of the 4 read from this image have been reviewed.',
      ),
    ).toBeInTheDocument()
  })

  // The defect a product owner filed: this banner said every low-confidence
  // field had been reviewed while the same screen said 0 of 3 stages had run
  // and all fifteen fields read "Not read / Not scored". It was true of the
  // empty set and meaningless. A success state over nothing is a lie about the
  // one thing the screen exists to establish.
  it('never claims a completed review when nothing has been read', () => {
    render(
      <ImportReviewScreen project={PROJECT} session={sessionView(emptyDesignIntent(['img_1']))} />,
    )
    expect(screen.queryByText(/have been reviewed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/scored above the review threshold/i)).not.toBeInTheDocument()
    expect(screen.getByText('Nothing to review yet.')).toBeInTheDocument()
  })

  it('says so plainly when everything read scored above the threshold', () => {
    const confident = reviewableIntent({
      fieldConfidence: { 'pool.lengthFt': 0.97, 'pool.widthFt': 0.95 },
    })
    render(<ImportReviewScreen project={PROJECT} session={sessionView(confident)} />)
    expect(
      screen.getByText(
        'All 2 fields read from this image scored above the review threshold. None needs your confirmation.',
      ),
    ).toBeInTheDocument()
  })

  it('jumps to the field it names, the way the validation dock does', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    const queue = screen.getByRole('region', { name: 'Fields needing review' })
    fireEvent.click(within(queue).getByText('Deep depth'))
    expect(document.activeElement?.id).toBe(fieldDomId('pool.depthDeepFt'))
  })

  it('marks the blocking rows so they cannot be missed in a dense pane', () => {
    const { container } = render(
      <ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />,
    )
    const blocking = container.querySelectorAll('[data-blocking="true"]')
    expect(Array.from(blocking).map((n) => n.getAttribute('data-path')).sort()).toEqual([
      'deck.material',
      'pool.depthDeepFt',
    ])
  })
})

// The second half of the same defect: the ledger read "1 of 3 stages, Classify
// DONE, Extract NOT RUN, Calibrate NOT RUN" with no error anywhere on screen,
// and the button relabelled itself "Re-analyze" as though the job were done.
describe('a run that stopped after classify', () => {
  function stoppedSession() {
    const session = sessionView(emptyDesignIntent(['img_1']))
    const image = session.images[0]!
    return {
      ...session,
      images: [
        {
          ...image,
          kindLabel: 'Image',
          stages: {
            CLASSIFY: { status: 'OK' as const, errorRef: null },
            EXTRACT: { status: 'BLOCKED' as const, errorRef: null },
            CALIBRATE: { status: 'BLOCKED' as const, errorRef: null },
          },
          blocked: UNROUTABLE_STOP,
        },
      ],
    }
  }

  it('says which stages were skipped rather than leaving them as not-run', () => {
    render(<ImportReviewScreen project={PROJECT} session={stoppedSession()} />)
    const ledger = screen.getByRole('region', { name: /Extraction progress/i })
    expect(within(ledger).getAllByText('Skipped')).toHaveLength(2)
    expect(within(ledger).queryByText('Not run')).not.toBeInTheDocument()
    expect(within(ledger).getByText(/stopped after Classify/)).toBeInTheDocument()
  })

  it('explains why it stopped instead of showing an empty screen', () => {
    render(<ImportReviewScreen project={PROJECT} session={stoppedSession()} />)
    expect(screen.getByText(UNROUTABLE_STOP.headline)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(UNROUTABLE_STOP.detail.slice(0, 40)))).toBeInTheDocument()
  })

  it('does not label the button as if the run had finished', () => {
    render(<ImportReviewScreen project={PROJECT} session={stoppedSession()} />)
    expect(screen.queryByRole('button', { name: /Re-analyze/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})

describe('the analyse button label', () => {
  const base = { analyzing: false, complete: false, stopped: false, started: false }

  it('offers a first run when nothing has happened', () => {
    expect(analyzeButtonLabel(base)).toBe('Analyze image')
  })

  it('only says re-analyze once every stage is done', () => {
    expect(analyzeButtonLabel({ ...base, complete: true, started: true })).toBe('Re-analyze')
  })

  it('never says re-analyze after a partial run', () => {
    expect(analyzeButtonLabel({ ...base, started: true, stopped: true })).toBe('Try again')
    expect(analyzeButtonLabel({ ...base, started: true })).not.toBe('Re-analyze')
  })
})

describe('the apply diff preview', () => {
  it('states exactly what applying creates, before anything is created', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    expect(screen.getByText('1 polygon pool rectangle, 32 ft x 16 ft')).toBeInTheDocument()
    expect(screen.getByText('1 paver deck 6 ft wide')).toBeInTheDocument()
    expect(screen.getByText('1 spa 7 ft x 7 ft')).toBeInTheDocument()
    expect(screen.getByText('2 sun shelves 8 ft x 4 ft')).toBeInTheDocument()
  })

  it('blocks apply while fields are unreviewed, and says which ones', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    const footer = screen.getByRole('contentinfo', { name: 'Apply preview' })
    expect(within(footer).getByRole('button', { name: 'Apply to project' })).toBeDisabled()
    expect(within(footer).getByText(/deck material, deep depth/)).toBeInTheDocument()
  })

  it('enables apply and dispatches import.intent.apply once the gates clear', async () => {
    render(
      <ImportReviewScreen
        project={PROJECT}
        session={sessionView(reviewableIntent(), {
          touchedFieldPaths: ['deck.material', 'pool.depthDeepFt'],
        })}
      />,
    )
    const apply = screen.getByRole('button', { name: 'Apply to project' })
    expect(apply).toBeEnabled()
    await act(async () => {
      fireEvent.click(apply)
    })
    expect(dispatchMock).toHaveBeenCalledWith('import.intent.apply', {
      sessionId: 'session_1',
      projectId: 'project_1',
    })
  })

  it('surfaces the real server error rather than pretending the apply worked', async () => {
    dispatchMock.mockResolvedValue({ ok: false, error: 'not implemented: track I4 (review + apply)' })
    render(
      <ImportReviewScreen
        project={PROJECT}
        session={sessionView(reviewableIntent(), {
          touchedFieldPaths: ['deck.material', 'pool.depthDeepFt'],
        })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply to project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'not implemented: track I4 (review + apply)',
    )
    expect(push).not.toHaveBeenCalled()
  })
})

describe('the null-scale blocked state', () => {
  const unscaled = () =>
    reviewableIntent({
      fieldConfidence: {},
      scale: { pixelsPerInch: null, method: null, confidence: 0 },
    })

  it('says plainly why nothing can be applied instead of showing a bare disabled button', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(unscaled())} />)
    expect(
      screen.getByText('This image has no scale, so no geometry can be applied.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply to project' })).toBeDisabled()
    expect(screen.getByText('Set the scale before applying.')).toBeInTheDocument()
  })

  it('offers the two-point calibration tool, and only sets the scale through the command', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(unscaled())} />)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrate' }))
    expect(screen.getByText('Two-point calibration')).toBeInTheDocument()

    // No points marked yet, so there is nothing to save.
    expect(screen.getByRole('button', { name: /Set scale/ })).toBeDisabled()
    expect(screen.getByLabelText('Real world distance between the two points')).toBeDisabled()
  })

  it('shows the resolved scale and its provenance once one exists', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    expect(screen.getByText(/4\.00 px/)).toBeInTheDocument()
    expect(screen.getByText(/from detected grid pitch/)).toBeInTheDocument()
  })
})

describe('extraction progress', () => {
  it('shows a stage ledger rather than a spinner', () => {
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    const progress = screen.getByRole('region', { name: 'Extraction progress for Sketch 1' })
    expect(within(progress).getByText('Classify')).toBeInTheDocument()
    expect(within(progress).getByText('Extract')).toBeInTheDocument()
    expect(within(progress).getByText('Calibrate')).toBeInTheDocument()
    expect(within(progress).getByText('0 of 3 stages')).toBeInTheDocument()
  })

  it('reports a failed analyze with the real error and keeps retry available', async () => {
    dispatchMock.mockResolvedValue({ ok: false, error: 'not implemented: track I2 (extraction)' })
    render(<ImportReviewScreen project={PROJECT} session={sessionView(reviewableIntent())} />)
    fireEvent.click(screen.getByRole('button', { name: /Analyze image/ }))
    expect(await screen.findByText('not implemented: track I2 (extraction)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analyze image/ })).toBeEnabled()
  })
})
