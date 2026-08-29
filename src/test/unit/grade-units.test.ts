/** @vitest-environment jsdom */

// Feet on the wire, inches in the store.
//
// The grade speaks feet throughout: elevations, the datum, and now the
// coordinates too. Told the coordinates were inches while everything else about
// a grade was feet, the agent refused to place "ten feet right and twenty feet
// back" at all rather than guess at the conversion, which is the right instinct
// and a sign the command was wrong.

import { createElement } from 'react'

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { dispatch } from '@/lib/commands/dispatch'
import { emptyGrade } from '@/modules/editor/grade/model'
import { useGradeStore } from '@/modules/editor/state/gradeStore'

describe('grade coordinates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true, data: {} })))
    useGradeStore.setState({ existing: emptyGrade(), finished: emptyGrade(), editing: 'existing' })
    render(createElement(ClientCommandHandlers))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('stores a point spoken in feet at the right place in inches', async () => {
    await dispatch('grade.point.add', { surface: 'existing', xFt: 10, yFt: 20, elevationFt: -3 })

    const point = useGradeStore.getState().existing.points[0]
    expect(point?.x).toBe(120)
    expect(point?.y).toBe(240)
    // Elevation was always feet and must not be converted with the coordinates.
    expect(point?.elevationFt).toBe(-3)
  })

  it('converts a moved point the same way', async () => {
    await dispatch('grade.point.add', { surface: 'existing', xFt: 0, yFt: 0, elevationFt: 0 })
    const id = useGradeStore.getState().existing.points[0]!.id

    await dispatch('grade.point.update', { surface: 'existing', pointId: id, xFt: 5, yFt: -2 })

    const point = useGradeStore.getState().existing.points[0]
    expect(point?.x).toBe(60)
    expect(point?.y).toBe(-24)
  })

  it('leaves an elevation alone when only the position moves', async () => {
    await dispatch('grade.point.add', { surface: 'existing', xFt: 0, yFt: 0, elevationFt: 4 })
    const id = useGradeStore.getState().existing.points[0]!.id

    await dispatch('grade.point.update', { surface: 'existing', pointId: id, xFt: 9 })

    expect(useGradeStore.getState().existing.points[0]?.elevationFt).toBe(4)
  })

  it('refuses a point that is not there rather than adding one', async () => {
    const result = await dispatch('grade.point.update', {
      surface: 'existing',
      pointId: 'ghost',
      elevationFt: 1,
    })
    expect(result.ok).toBe(false)
    expect(useGradeStore.getState().existing.points).toHaveLength(0)
  })
})
