'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useShapesStore } from '@/modules/editor/state'
import type { Shape } from '@/modules/editor/state/shapes'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  type PriceBookItemLite,
  type PricingSelections,
  type QuoteSummary,
} from '@/modules/pricing/engine'

/**
 * Everything needed to price the drawing in the browser.
 *
 * The dock used to render a quote computed once, on the server, when the page
 * mounted, and a cached one at that. Widening a pool from 12' to 16' moved the
 * surface area from 300 to 400 sq ft and left the price untouched, because the
 * price on screen was not a function of the drawing on screen. `computeQuote`
 * is pure, so the same function the proposal runs is run here against the live
 * shape store instead.
 */
export interface PricingInput {
  items: PriceBookItemLite[]
  selections: PricingSelections
  taxRatePct: number
}

const PricingContext = createContext<PricingInput | null>(null)

export function PricingProvider({
  value,
  children,
}: {
  value: PricingInput | null
  children: ReactNode
}) {
  return <PricingContext.Provider value={value}>{children}</PricingContext.Provider>
}

export function usePricingInput(): PricingInput | null {
  return useContext(PricingContext)
}

function quoteFor(shapes: Shape[], input: PricingInput | null): QuoteSummary | null {
  if (!input) return null
  return computeQuote(input.items, computeMeasurements(shapes), input.selections, {
    taxRatePct: input.taxRatePct,
  })
}

/** The quote for what is on the canvas right now. */
export function useLiveQuote(): QuoteSummary | null {
  const shapes = useShapesStore((s) => s.shapes)
  const input = usePricingInput()
  return useMemo(() => quoteFor(shapes, input), [shapes, input])
}

/**
 * What one object is worth: the difference between the quote with it and the
 * quote without it.
 *
 * Real marginal cost rather than a share of the total, so a shape that changes
 * nothing honestly reports nothing.
 */
export function useShapeContribution(shapeId: string | undefined): {
  total: number
  withoutTotal: number
  changedLines: Array<{ name: string; delta: number }>
} | null {
  const shapes = useShapesStore((s) => s.shapes)
  const input = usePricingInput()
  return useMemo(() => {
    if (!input || !shapeId) return null
    const withAll = quoteFor(shapes, input)
    const withoutIt = quoteFor(
      shapes.filter((s) => s.id !== shapeId),
      input,
    )
    if (!withAll || !withoutIt) return null
    const before = new Map(withoutIt.lineItems.map((l) => [l.itemId, l]))
    const changedLines: Array<{ name: string; delta: number }> = []
    for (const line of withAll.lineItems) {
      const delta = Math.round((line.total - (before.get(line.itemId)?.total ?? 0)) * 100) / 100
      if (delta !== 0) changedLines.push({ name: line.name, delta })
      before.delete(line.itemId)
    }
    for (const [, line] of before) {
      if (line.total !== 0) changedLines.push({ name: line.name, delta: -line.total })
    }
    changedLines.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    return {
      total: Math.round((withAll.total - withoutIt.total) * 100) / 100,
      withoutTotal: withoutIt.total,
      changedLines,
    }
  }, [shapes, input, shapeId])
}
