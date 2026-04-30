import { beforeAll, describe, expect, it } from 'vitest'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext } from '@/modules/commands/registry'

const ctx: CommandContext = { userId: 'u_test', orgId: 'o_test' }

beforeAll(() => {
  initCommands()
})

function getCmd(id: string) {
  const c = get(id)
  if (!c) throw new Error(`command ${id} not registered`)
  return c
}

async function runOk<I>(id: string, input: I): Promise<unknown> {
  const c = getCmd(id)
  const parsed = c.inputSchema.safeParse(input)
  expect(parsed.success).toBe(true)
  if (!parsed.success) throw new Error('unreachable')
  const res = await c.execute(parsed.data, ctx)
  expect(res.ok).toBe(true)
  if (!res.ok) throw new Error('unreachable')
  return res.data
}

describe('canvas commands', () => {
  it('canvas.zoom.in returns ok', async () => {
    await runOk('canvas.zoom.in', {})
  })

  it('canvas.zoom.out accepts custom step', async () => {
    await runOk('canvas.zoom.out', { step: 1.5 })
  })

  it('canvas.fit returns ok', async () => {
    await runOk('canvas.fit', {})
  })

  it('canvas.pan echoes offsets', async () => {
    const data = (await runOk('canvas.pan', { dx: 10, dy: -5 })) as {
      x: number
      y: number
    }
    expect(data).toEqual({ x: 10, y: -5 })
  })

  it('selection.set echoes ids (incl. empty)', async () => {
    const a = (await runOk('selection.set', { ids: ['s1'] })) as {
      selectedIds: string[]
    }
    expect(a.selectedIds).toEqual(['s1'])
    const b = (await runOk('selection.set', { ids: [] })) as {
      selectedIds: string[]
    }
    expect(b.selectedIds).toEqual([])
  })

  it('camera.set.view echoes view', async () => {
    const data = (await runOk('camera.set.view', { view: 'iso' })) as {
      view: string
    }
    expect(data.view).toBe('iso')
  })

  it('camera.set.view rejects unknown view', () => {
    const c = getCmd('camera.set.view')
    const r = c.inputSchema.safeParse({ view: 'diagonal' })
    expect(r.success).toBe(false)
  })

  it('camera.frame.selection returns framed', async () => {
    const data = (await runOk('camera.frame.selection', {})) as {
      framed: boolean
    }
    expect(data.framed).toBe(true)
  })

  it('mode.set.presentation echoes mode', async () => {
    const data = (await runOk('mode.set.presentation', {
      mode: 'customer',
    })) as { mode: string }
    expect(data.mode).toBe('customer')
  })

  it('mode.set.presentation rejects bad mode', () => {
    const c = getCmd('mode.set.presentation')
    const r = c.inputSchema.safeParse({ mode: 'admin' })
    expect(r.success).toBe(false)
  })

  it('view.set.tab echoes tab', async () => {
    const data = (await runOk('view.set.tab', { tab: 'plan' })) as {
      tab: string
    }
    expect(data.tab).toBe('plan')
  })
})
