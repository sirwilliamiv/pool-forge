import { beforeAll, describe, expect, it } from 'vitest'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, EditorCommand } from '@/modules/commands/registry'

const ctx: CommandContext = { userId: 'u_test', orgId: 'o_test' }

beforeAll(() => {
  initCommands()
})

function cmd(id: string): EditorCommand<unknown, unknown> {
  const c = get(id)
  if (!c) throw new Error(`command ${id} not registered`)
  return c
}

async function runOk<I>(id: string, input: I): Promise<unknown> {
  const c = cmd(id)
  const parsed = c.inputSchema.safeParse(input)
  expect(parsed.success, `inputSchema rejected valid input for ${id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true)
  if (!parsed.success) throw new Error('unreachable')
  const res = await c.execute(parsed.data, ctx)
  expect(res.ok, `execute failed for ${id}: ${res.ok ? '' : res.error}`).toBe(true)
  if (!res.ok) throw new Error('unreachable')
  return res.data
}

describe('shape commands — execute returns ok', () => {
  it('add.shape', async () => {
    const data = (await runOk('add.shape', {
      stencilId: 'pool.rectangle',
      x: 0,
      y: 0,
    })) as { shapeId: string }
    expect(typeof data.shapeId).toBe('string')
  })

  it('add.shape rejects a stencil id that does not exist', () => {
    // An unknown id does not fail loudly downstream: addShape falls back to a
    // generic STENCIL kind and drops a blank rectangle on the canvas. Catching
    // it at the schema is what keeps a model from inventing one.
    const schema = cmd('add.shape').inputSchema
    expect(schema.safeParse({ stencilId: 'rectangle_pool', x: 0, y: 0 }).success).toBe(false)
    expect(schema.safeParse({ stencilId: 'pool.rectangle', x: 0, y: 0 }).success).toBe(true)
  })

  it('select.shape echoes ids', async () => {
    const data = (await runOk('select.shape', { ids: ['s1', 's2'] })) as {
      selectedIds: string[]
    }
    expect(data.selectedIds).toEqual(['s1', 's2'])
  })

  it('move.shape echoes coordinates', async () => {
    const data = (await runOk('move.shape', { id: 's1', x: 10, y: 20 })) as {
      id: string
      x: number
      y: number
    }
    expect(data).toEqual({ id: 's1', x: 10, y: 20 })
  })

  it('resize.shape echoes dimensions', async () => {
    const data = (await runOk('resize.shape', {
      id: 's1',
      width: 30,
      height: 12,
    })) as { id: string; width: number; height: number }
    expect(data).toEqual({ id: 's1', width: 30, height: 12 })
  })

  it('rotate.shape echoes degrees', async () => {
    const data = (await runOk('rotate.shape', { id: 's1', degrees: 45 })) as {
      id: string
      degrees: number
    }
    expect(data).toEqual({ id: 's1', degrees: 45 })
  })

  it('delete.shape echoes ids', async () => {
    const data = (await runOk('delete.shape', { ids: ['s1'] })) as {
      deletedIds: string[]
    }
    expect(data.deletedIds).toEqual(['s1'])
  })

  it('duplicate.shape returns sourceId', async () => {
    const data = (await runOk('duplicate.shape', { id: 's1' })) as {
      sourceId: string
      newId: string
    }
    expect(data.sourceId).toBe('s1')
    expect(typeof data.newId).toBe('string')
  })

  it('set.shape.material echoes id+materialId', async () => {
    const data = (await runOk('set.shape.material', {
      id: 's1',
      materialId: 'pebbletec.cobalt',
    })) as { id: string; materialId: string }
    expect(data).toEqual({ id: 's1', materialId: 'pebbletec.cobalt' })
  })

  it('pool.geometry.update returns id', async () => {
    const data = (await runOk('pool.geometry.update', {
      id: 's1',
      length: 30,
    })) as { id: string }
    expect(data.id).toBe('s1')
  })

  it('pool.material.set echoes slot+material', async () => {
    const data = (await runOk('pool.material.set', {
      id: 's1',
      slot: 'interior',
      materialId: 'pebbletec.cobalt',
    })) as { id: string; slot: string; materialId: string }
    expect(data).toEqual({
      id: 's1',
      slot: 'interior',
      materialId: 'pebbletec.cobalt',
    })
  })

  it('pool.depth.set returns id', async () => {
    const data = (await runOk('pool.depth.set', {
      id: 's1',
      shallowDepth: 36,
      deepDepth: 84,
    })) as { id: string }
    expect(data.id).toBe('s1')
  })
})

describe('shape commands — input validation rejects bad input', () => {
  it('select.shape rejects empty ids', () => {
    const c = cmd('select.shape')
    const r = c.inputSchema.safeParse({ ids: [] })
    expect(r.success).toBe(false)
  })

  it('resize.shape rejects negative width', () => {
    const c = cmd('resize.shape')
    const r = c.inputSchema.safeParse({ id: 's1', width: -1, height: 10 })
    expect(r.success).toBe(false)
  })

  it('pool.material.set rejects unknown slot', () => {
    const c = cmd('pool.material.set')
    const r = c.inputSchema.safeParse({
      id: 's1',
      slot: 'floor',
      materialId: 'x',
    })
    expect(r.success).toBe(false)
  })

  it('pool.geometry.update rejects a negative length', () => {
    const c = cmd('pool.geometry.update')
    expect(c.inputSchema.safeParse({ id: 's1', lengthFt: -5 }).success).toBe(false)
    expect(c.inputSchema.safeParse({ id: 's1', lengthFt: 30 }).success).toBe(true)
  })

  it('pool.geometry.update ignores a field name that no longer exists', () => {
    // Zod strips unknown keys, so the old `length` parses cleanly and carries
    // nothing. On its own that is a command reporting success and doing
    // nothing, which is why the handler refuses an input it recognises no
    // fields in rather than quietly succeeding.
    const c = cmd('pool.geometry.update')
    const parsed = c.inputSchema.safeParse({ id: 's1', length: 30 })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(Object.keys(parsed.data as object)).not.toContain("lengthFt")
  })
})
