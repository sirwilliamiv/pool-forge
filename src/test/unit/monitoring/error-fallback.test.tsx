// What the builder in the back garden sees.
//
// Two things have to be true of this screen: it shows a reference they can read
// down the phone, and it shows nothing of the underlying error, because that
// message can quote a customer's name or a contract total and means nothing to
// them anyway.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import { ErrorFallback } from '@/components/monitoring/ErrorFallback'

const CUSTOMER_MESSAGE = 'Failed to save quote for Margaret Fitzwilliam, total $48,750.00'

let posted: { url: string; body: string }[] = []

beforeEach(() => {
  posted = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      posted.push({ url: String(url), body: String(init?.body ?? '') })
      return new Response(JSON.stringify({ ok: true }), { status: 202 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ErrorFallback', () => {
  it('shows an err_ reference the user can quote to support', async () => {
    render(<ErrorFallback error={new Error(CUSTOMER_MESSAGE)} code="react_boundary" />)
    const ref = await screen.findByTestId('error-ref')
    expect(ref.textContent).toMatch(/^err_[0-9a-f]{12}$/)
  })

  it('never renders the underlying error message', async () => {
    render(<ErrorFallback error={new Error(CUSTOMER_MESSAGE)} code="react_boundary" />)
    await screen.findByTestId('error-ref')
    expect(document.body.textContent).not.toContain('Margaret')
    expect(document.body.textContent).not.toContain('48,750')
  })

  it('reports to the first-party endpoint with the ref it is showing', async () => {
    render(<ErrorFallback error={new Error(CUSTOMER_MESSAGE)} code="react_boundary" />)
    const ref = await screen.findByTestId('error-ref')
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]?.url).toBe('/api/monitoring/report')
    const body = JSON.parse(posted[0]?.body ?? '{}') as { ref: string; code: string }
    expect(body.ref).toBe(ref.textContent)
    expect(body.code).toBe('react_boundary')
  })

  it('still shows a reference when the report cannot be delivered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    render(<ErrorFallback error={new Error('boom')} code="global_boundary" standalone />)
    const ref = await screen.findByTestId('error-ref')
    expect(ref.textContent).toMatch(/^err_[0-9a-f]{12}$/)
  })
})
