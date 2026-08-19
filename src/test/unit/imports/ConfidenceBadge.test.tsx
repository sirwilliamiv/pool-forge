import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConfidenceBadge } from '@/components/imports/ConfidenceBadge'
import { CONFIDENCE_HIGH, CONFIDENCE_REVIEW_REQUIRED } from '@/modules/imports/intent'

// The bands are a contract, not a style choice: the red band is exactly the
// set of fields `import.intent.apply` refuses to write untouched, so an
// off-by-one at a boundary would let a user press Apply and be rejected.

function bandOf(score: number): string {
  const { container, unmount } = render(<ConfidenceBadge score={score} />)
  const node = container.querySelector('[data-band]')
  const band = node?.getAttribute('data-band') ?? 'missing'
  unmount()
  return band
}

describe('ConfidenceBadge banding', () => {
  it('is high exactly at the high threshold', () => {
    expect(CONFIDENCE_HIGH).toBe(0.85)
    expect(bandOf(0.85)).toBe('high')
  })

  it('is medium immediately below the high threshold', () => {
    expect(bandOf(0.8499)).toBe('medium')
  })

  it('is medium exactly at the review threshold', () => {
    expect(CONFIDENCE_REVIEW_REQUIRED).toBe(0.6)
    expect(bandOf(0.6)).toBe('medium')
  })

  it('is low immediately below the review threshold', () => {
    expect(bandOf(0.5999)).toBe('low')
  })

  it('is high at the top of the range and low at the bottom', () => {
    expect(bandOf(1)).toBe('high')
    expect(bandOf(0)).toBe('low')
  })

  it('calls out the low band in words, not colour alone', () => {
    render(<ConfidenceBadge score={0.4} />)
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('says so plainly when the extractor never scored the field', () => {
    render(<ConfidenceBadge score={null} />)
    expect(screen.getByText('Not scored')).toBeInTheDocument()
  })
})
