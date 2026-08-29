// A running commentary on what the voice agent is doing.
//
// Tails the app log and writes a digest: what was said, what ran, and — the
// reason this exists — anything that looks like a loop. A loop is invisible in
// a raw log because every line in it is a success; it only shows as a shape
// over time, which is exactly what a person scrolling cannot see.

import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'

const SOURCE = process.argv[2] ?? '/tmp/electron.log'
const OUT = process.argv[3] ?? '/tmp/voice-watch.log'

/** Calls with no user speech between them. Reset when the user says something. */
let sinceUser = []
/** Signature counts within the current turn. */
const repeats = new Map()
let reported = new Set()

writeFileSync(OUT, `watching ${SOURCE}\n`)

function say(line) {
  appendFileSync(OUT, `${new Date().toISOString().slice(11, 19)} ${line}\n`)
}

/**
 * A cycle is a sequence that comes back to where it started.
 *
 * Looks for the shortest repeating run in the calls since the user last spoke,
 * which catches add-add-add-undo-undo-undo without knowing anything about those
 * particular commands.
 */
function findCycle(names) {
  for (let period = 1; period <= Math.floor(names.length / 3); period++) {
    const tail = names.slice(-period * 3)
    const first = tail.slice(0, period).join('>')
    const second = tail.slice(period, period * 2).join('>')
    const third = tail.slice(period * 2).join('>')
    if (first === second && second === third) return first
  }
  return null
}

const tail = spawn('tail', ['-n', '0', '-F', SOURCE])
let buffer = ''

tail.stdout.on('data', chunk => {
  buffer += chunk.toString()
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''

  for (const line of lines) {
    const said = /voice_said (\{.*\})/.exec(line)
    if (said) {
      try {
        const { role, text } = JSON.parse(said[1])
        say(`${role === 'user' ? 'USER ' : 'MODEL'} ${text}`)
        if (role === 'user') {
          sinceUser = []
          repeats.clear()
          reported = new Set()
        }
      } catch {}
      continue
    }

    const ran = /voice_tool_ran (\{.*\})/.exec(line)
    if (ran) {
      try {
        const { name, ok, summary } = JSON.parse(ran[1])
        say(`  tool ${name} ${ok ? 'ok' : 'FAILED'} ${summary ?? ''}`)
        sinceUser.push(name)

        const signature = `${name}|${summary ?? ''}`
        repeats.set(signature, (repeats.get(signature) ?? 0) + 1)

        const cycle = findCycle(sinceUser)
        if (cycle && !reported.has(cycle)) {
          reported.add(cycle)
          say(`  *** LOOP: "${cycle}" has repeated three times with no word from the user`)
        }
        if (sinceUser.length === 15) {
          say(`  *** ${sinceUser.length} actions since the user last spoke`)
        }
      } catch {}
      continue
    }

    for (const [pattern, label] of [
      [/voice_loop_broken (\{.*\})/, 'LOOP GUARD FIRED'],
      [/voice_repeat_refused (\{.*\})/, 'REPEAT REFUSED'],
      [/voice_tool_out_of_scope (\{.*\})/, 'OUT OF SCOPE'],
      [/voice_tool_threw (\{.*\})/, 'TOOL THREW'],
      [/voice_error (\{.*\})/, 'SESSION ERROR'],
      [/voice_reconnect_failed (\{.*\})/, 'RECONNECT FAILED'],
      [/voice_start_failed (\{.*\})/, 'START FAILED'],
    ]) {
      const hit = pattern.exec(line)
      if (hit) say(`  *** ${label} ${hit[1]}`)
    }
  }
})

tail.on('exit', code => say(`tail exited ${code}`))
