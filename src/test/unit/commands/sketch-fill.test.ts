import { describe, expect, it } from 'vitest'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'

describe('sketch.fill.set', () => {
  it('is registered, client-run, voiced, and accepts the four hues plus none', () => {
    initCommands()
    const command = get('sketch.fill.set')
    expect(command).toBeTruthy()
    expect(command?.runsOn).toBe('client')
    expect(command?.category).toBe('sketch')
    expect((command?.voiceExamples?.length ?? 0)).toBeGreaterThan(0)
    for (const color of ['blue', 'green', 'orange', 'purple', 'none']) {
      expect(command?.inputSchema.safeParse({ id: 'a', color }).success, color).toBe(true)
    }
    expect(command?.inputSchema.safeParse({ id: 'a', color: 'red' }).success).toBe(false)
  })
})
