import { beforeAll, describe, expect, it } from 'vitest'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext } from '@/modules/commands/registry'

const ctx: CommandContext = { userId: 'u_test', orgId: 'o_test' }

beforeAll(() => {
  initCommands()
})

describe('scene commands', () => {
  it('sun.set.time echoes minutes', async () => {
    const c = get('sun.set.time')!
    const parsed = c.inputSchema.safeParse({ minutesPastMidnight: 16 * 60 })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const res = await c.execute(parsed.data, ctx)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((res.data as { minutesPastMidnight: number }).minutesPastMidnight).toBe(16 * 60)
  })

  it('sun.set.time rejects out-of-range minutes', () => {
    const c = get('sun.set.time')!
    expect(c.inputSchema.safeParse({ minutesPastMidnight: -1 }).success).toBe(false)
    expect(c.inputSchema.safeParse({ minutesPastMidnight: 24 * 60 + 1 }).success).toBe(false)
  })

  it('sun.run.study returns started', async () => {
    const c = get('sun.run.study')!
    const parsed = c.inputSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const res = await c.execute(parsed.data, ctx)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((res.data as { started: boolean }).started).toBe(true)
  })

  it('sun.run.study rejects negative duration', () => {
    const c = get('sun.run.study')!
    expect(c.inputSchema.safeParse({ durationMs: -1 }).success).toBe(false)
  })
})

describe('palette commands', () => {
  it('palette.open returns opened', async () => {
    const c = get('palette.open')!
    const parsed = c.inputSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const res = await c.execute(parsed.data, ctx)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((res.data as { opened: boolean }).opened).toBe(true)
  })

  it('palette.run.suggestion validates inner ids and returns ran', async () => {
    const c = get('palette.run.suggestion')!
    const input = {
      suggestionId: 'sug-1',
      innerCommandId: 'add.shape',
      innerInput: { stencilId: 'rect-pool', x: 0, y: 0 },
    }
    const parsed = c.inputSchema.safeParse(input)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const res = await c.execute(parsed.data, ctx)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((res.data as { ran: boolean }).ran).toBe(true)
  })
})
