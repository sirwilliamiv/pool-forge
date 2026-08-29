/**
 * Score the voice agent against the real model.
 *
 * Every case is a sentence a builder would say and a set of assertions about the
 * tool calls it should produce. Not about the words it says back: scoring prose
 * measures phrasing, scoring calls measures whether the app did the right thing.
 *
 *   pnpm voice:eval                 # every case
 *   pnpm voice:eval add-pool        # cases whose id contains "add-pool"
 *   pnpm voice:eval --repeat 3      # each case three times, for flakiness
 *   pnpm voice:eval --json out.json # machine-readable, for tracking over time
 *
 * Exit code is non-zero when anything failed, so it can gate a release.
 */

import { writeFileSync } from 'node:fs'

import { initCommands } from '@/modules/commands/init'
import { loadVoiceConfig, voiceEnabled } from '@/modules/voice/config'
import { EVAL_CASES } from '@/modules/voice/eval/cases'
import { runCase, surfaceSizes, type CaseResult } from '@/modules/voice/eval/run'

initCommands()

const argv = process.argv.slice(2)
const repeat = intFlag('--repeat') ?? 1
const jsonPath = stringFlag('--json')
const filters = argv.filter(arg => !arg.startsWith('--') && !isFlagValue(arg))

const cases = filters.length
  ? EVAL_CASES.filter(testCase => filters.some(filter => testCase.id.includes(filter)))
  : EVAL_CASES

async function main(): Promise<void> {
  if (!voiceEnabled()) {
    console.error('Voice is off. Set VOICE_LIVE=1 and GCP_PROJECT_ID.')
    process.exit(1)
  }
  if (cases.length === 0) {
    console.error(`No case matches ${filters.join(', ')}`)
    process.exit(1)
  }

  const config = loadVoiceConfig()
  console.log(`model ${config.model}`)
  console.log(
    `tools per screen: ${Object.entries(surfaceSizes(cases))
      .map(([screen, count]) => `${screen} ${count}`)
      .join(' · ')}`,
  )
  console.log(`${cases.length} case(s)${repeat > 1 ? ` x ${repeat}` : ''}\n`)

  const results: CaseResult[] = []

  // Sequential on purpose: concurrent Live sessions bill concurrently, and a
  // rate-limited run would score the quota rather than the agent.
  for (let pass = 0; pass < repeat; pass++) {
    for (const testCase of cases) {
      let result: CaseResult
      try {
        result = await runCase(testCase, config)
      } catch (error) {
        result = {
          id: testCase.id,
          utterance: testCase.utterance,
          passed: false,
          failures: [`session failed: ${String(error).slice(0, 160)}`],
          calls: [],
          spoken: '',
          ms: 0,
        }
      }
      results.push(result)
      report(result)
    }
  }

  summarise(results)

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ model: config.model, results }, null, 2))
    console.log(`\nwrote ${jsonPath}`)
  }

  process.exit(results.every(result => result.passed) ? 0 : 1)
}

function report(result: CaseResult): void {
  const mark = result.passed ? 'PASS' : 'FAIL'
  console.log(`${mark}  ${result.id.padEnd(28)} ${(result.ms / 1000).toFixed(1)}s`)
  if (result.passed) return

  console.log(`      "${result.utterance}"`)
  for (const failure of result.failures) console.log(`      - ${failure}`)
  console.log(
    `      called: ${result.calls.map(call => `${call.commandId}(${JSON.stringify(call.args)})`).join(', ') || '(nothing)'}`,
  )
  if (result.spoken) console.log(`      said: ${result.spoken.slice(0, 160)}`)
}

function summarise(results: CaseResult[]): void {
  const passed = results.filter(result => result.passed).length
  const pct = ((passed / results.length) * 100).toFixed(0)
  console.log(`\n${passed}/${results.length} passed (${pct}%)`)

  // Per-case rates matter more than the headline when repeating: a case that
  // passes two times in three is not a passing case, it is a flaky one.
  const byCase = new Map<string, { passed: number; total: number }>()
  for (const result of results) {
    const entry = byCase.get(result.id) ?? { passed: 0, total: 0 }
    entry.total += 1
    if (result.passed) entry.passed += 1
    byCase.set(result.id, entry)
  }

  const flaky = [...byCase.entries()].filter(([, entry]) => entry.passed > 0 && entry.passed < entry.total)
  if (flaky.length > 0) {
    console.log('\nflaky:')
    for (const [id, entry] of flaky) console.log(`  ${id}: ${entry.passed}/${entry.total}`)
  }

  const failing = [...byCase.entries()].filter(([, entry]) => entry.passed === 0)
  if (failing.length > 0) {
    console.log('\nfailing every time:')
    for (const [id] of failing) console.log(`  ${id}`)
  }
}

function intFlag(name: string): number | undefined {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  const value = Number(argv[index + 1])
  return Number.isFinite(value) ? value : undefined
}

function stringFlag(name: string): string | undefined {
  const index = argv.indexOf(name)
  return index < 0 ? undefined : argv[index + 1]
}

/** True when this argument is the value belonging to a preceding flag. */
function isFlagValue(arg: string): boolean {
  const index = argv.indexOf(arg)
  return index > 0 && (argv[index - 1] ?? '').startsWith('--')
}

void main()
