/** @vitest-environment jsdom */
import { describe, it } from 'vitest'
import { initCommands } from '@/modules/commands/init'
import { all } from '@/modules/commands/registry'

initCommands()

describe('dump', () => {
  it('dumps', () => {
    const rows = all().map(c => `${c.id}\t${c.category}\t${c.runsOn ?? '-'}\t${c.unimplemented ? 'STUB' : ''}`)
    console.log('TOTAL', rows.length)
    console.log(rows.join('\n'))
  })
})
