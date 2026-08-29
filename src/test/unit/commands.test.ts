import { describe, it, expect, beforeAll } from 'vitest'
import { initCommands } from '@/modules/commands/init'
import { all, get } from '@/modules/commands/registry'

const REQUIRED_COMMAND_IDS = [
  'create.project',
  'open.project',
  'save.project',
  'add.shape',
  'select.shape',
  'move.shape',
  'resize.shape',
  'rotate.shape',
  'delete.shape',
  'duplicate.shape',
  'set.shape.material',
  'set.pool.depth',
  'set.pool.targetArea',
  'calculate.measurements',
  'add.priceBookItem',
  'select.equipment',
  'generate.quote',
  'run.validation',
  'export.customerProposal',
  'export.constructionPacket',
  'export.sitePlan',
  'export.screenEnclosureQuote',
  'import.session.create',
  'import.image.upload',
  'import.image.analyze',
  'import.calibrate.set',
  'import.intent.patch',
  'import.intent.apply',
  'import.session.discard',
] as const

describe('command registry', () => {
  beforeAll(() => {
    initCommands()
  })

  it('registers at least 20 commands', () => {
    expect(all().length).toBeGreaterThanOrEqual(20)
  })

  it.each(REQUIRED_COMMAND_IDS)('registers required command: %s', (id) => {
    const cmd = get(id)
    expect(cmd, `command ${id} is missing`).toBeDefined()
    expect(cmd?.id).toBe(id)
  })

  it('every registered command declares a category, label, and schemas', () => {
    for (const cmd of all()) {
      expect(cmd.category, `${cmd.id} missing category`).toBeTruthy()
      expect(cmd.label, `${cmd.id} missing label`).toBeTruthy()
      expect(cmd.inputSchema, `${cmd.id} missing inputSchema`).toBeDefined()
      expect(cmd.outputSchema, `${cmd.id} missing outputSchema`).toBeDefined()
    }
  })
})
