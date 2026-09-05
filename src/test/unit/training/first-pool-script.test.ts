// The training script can only be as trustworthy as the ids in it. Every step
// that performs an action must name a command that is actually registered and
// pass that command's own input schema, and every highlight must name a real
// guide target. Without this, a step could announce "adding the spa" and then
// dispatch a command that silently does nothing — the exact failure the whole
// scripted-not-improvised design exists to prevent.

import { describe, expect, it, beforeAll } from 'vitest'

import { FIRST_POOL_SCRIPT, type TrainingContext } from '@/modules/editor/training/first-pool-script'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import { GUIDE_TARGETS } from '@/modules/guide/targets'
import { getStencil } from '@/modules/editor/stencils'

const TARGET_IDS = new Set(GUIDE_TARGETS.map(t => t.id))

beforeAll(() => {
  initCommands()
})

describe('the first-pool training script', () => {
  it('has a spoken line on every step', () => {
    for (const step of FIRST_POOL_SCRIPT) {
      expect(step.say.trim().length).toBeGreaterThan(0)
    }
  })

  it('only highlights controls that exist', () => {
    for (const step of FIRST_POOL_SCRIPT) {
      for (const target of step.point ?? []) {
        expect(TARGET_IDS.has(target), `unknown guide target: ${target}`).toBe(true)
      }
    }
  })

  it('every action names a registered command whose input it satisfies', () => {
    // The context is threaded through: the pool step captures an id the depth
    // step needs, so we run the builders in order with a stub id standing in
    // for whatever add.shape returns.
    const ctx: TrainingContext = { poolId: 'shape_stub' }
    for (const step of FIRST_POOL_SCRIPT) {
      if (!step.run) continue
      const action = step.run(ctx)
      if (action === null) continue
      const command = get(action.command)
      expect(command, `step "${step.say.slice(0, 32)}…" dispatches unknown command ${action.command}`).toBeDefined()
      const parsed = command!.inputSchema.safeParse(action.input)
      expect(
        parsed.success,
        `command ${action.command} rejected its scripted input: ${
          parsed.success ? '' : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        }`,
      ).toBe(true)
    }
  })

  it('every add.shape names a stencil that exists', () => {
    // add.shape's schema only checks stencilId is a string, so a typo'd id
    // would pass schema validation and then resolve to nothing at runtime —
    // the "announces the spa, adds nothing" failure. Resolve each id for real.
    const ctx: TrainingContext = { poolId: 'shape_stub' }
    for (const step of FIRST_POOL_SCRIPT) {
      const action = step.run?.(ctx)
      if (!action || action.command !== 'add.shape') continue
      const stencilId = (action.input as { stencilId?: string }).stencilId
      expect(stencilId, `step "${step.say.slice(0, 32)}…" add.shape has no stencilId`).toBeTruthy()
      expect(getStencil(stencilId!), `unknown stencil: ${stencilId}`).toBeDefined()
    }
  })

  it('captures the pool id so the depth step can find it', () => {
    // Beat 2 (the pool) must write poolId; beat 3 (depths) must reference it.
    const poolStep = FIRST_POOL_SCRIPT.find(s => s.capture)
    expect(poolStep, 'no step captures the pool id').toBeDefined()
    const ctx: TrainingContext = {}
    poolStep!.capture!(ctx, { shapeId: 'shape_pool_1' })
    expect(ctx.poolId).toBe('shape_pool_1')

    // With no pool captured, the depth step must produce nothing rather than
    // dispatch pool.geometry.update against an undefined id.
    const depthStep = FIRST_POOL_SCRIPT.find(
      s => s.run && s.run({ poolId: 'x' })?.command === 'pool.geometry.update',
    )
    expect(depthStep, 'no depth step found').toBeDefined()
    expect(depthStep!.run!({})).toBeNull()
  })
})
