#!/usr/bin/env node
// Read a recorded chapter's captions aloud and lay them over the video.
//
// The captions are already written for a person to read, and `say()` in
// `src/test/e2e/demo/_demo.ts` writes each one to `captions.jsonl` next to the
// video with the moment it went up. So the whole job is: say each line, and
// start it at that moment.
//
// The one thing that does not come for free is pacing. Chapters were timed for
// reading, and speech is slower, so a first attempt squeezed thirteen of
// twenty-one lines to fit and still talked over the next caption. Hence two
// commands rather than one:
//
//   node scripts/narrate-demo.mjs measure     # how long each line takes to say
//   pnpm demo 20                              # re-record, holding each caption that long
//   node scripts/narrate-demo.mjs mix         # lay the voice over the video
//
// `measure` writes `src/test/e2e/demo/narration-timing.json`, which `say()`
// reads. Run it after changing caption text; a line with no entry falls back to
// the normal beat rather than blocking the recording.
//
// macOS only: it uses `say`, which is what is on the machine these are recorded
// on. Nothing else in the repo depends on this script.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VOICE = process.env.PF_VOICE ?? 'Samantha'
const RATE = Number(process.env.PF_VOICE_RATE ?? 178)
const TIMING_FILE = 'src/test/e2e/demo/narration-timing.json'
const OUTPUT_DIR = 'demo-output'

/** The spoken form of a caption. The interpunct is a visual separator, not a word. */
const spoken = (c) => (c.detail ? `${c.title}. ${c.detail}` : c.title).replaceAll('·', ',')

/** Keyed by what is said, so editing a caption invalidates only that line. */
const keyFor = (text) => createHash('sha1').update(text).digest('hex').slice(0, 16)

function seconds(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]).toString().trim()
  return Number(out) || 0
}

/** Every captions.jsonl under the output directory, newest run included. */
function captionFiles() {
  if (!existsSync(OUTPUT_DIR)) return []
  return readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(OUTPUT_DIR, d.name, 'captions.jsonl'))
    .filter(existsSync)
}

const readCaptions = (file) =>
  readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

function measure() {
  const timing = existsSync(TIMING_FILE) ? JSON.parse(readFileSync(TIMING_FILE, 'utf8')) : {}
  const work = mkdtempSync(join(tmpdir(), 'pf-narrate-'))
  let added = 0

  for (const file of captionFiles()) {
    for (const caption of readCaptions(file)) {
      const text = spoken(caption)
      const key = keyFor(text)
      if (timing[key] !== undefined) continue
      const clip = join(work, `${key}.aiff`)
      execFileSync('say', ['-v', VOICE, '-r', String(RATE), '-o', clip, text])
      timing[key] = Math.round(seconds(clip) * 1000)
      added += 1
    }
  }

  rmSync(work, { recursive: true, force: true })
  writeFileSync(TIMING_FILE, JSON.stringify(timing, null, 0).replaceAll(',"', ',\n"') + '\n')
  console.log(`${Object.keys(timing).length} lines timed (${added} new) -> ${TIMING_FILE}`)
}

function mix(videoIn, captionsIn, out) {
  const captions = readCaptions(captionsIn)
  if (captions.length === 0) throw new Error(`no captions in ${captionsIn}`)

  const videoMs = seconds(videoIn) * 1000
  const work = mkdtempSync(join(tmpdir(), 'pf-narrate-'))
  const clips = []
  let squeezed = 0

  captions.forEach((caption, i) => {
    // The room this line has before the next caption replaces it on screen.
    const nextAt = captions[i + 1]?.atMs ?? videoMs
    const gap = Math.max(0.6, (nextAt - caption.atMs) / 1000 - 0.15)

    const aiff = join(work, `${i}.aiff`)
    const wav = join(work, `${i}.wav`)
    execFileSync('say', ['-v', VOICE, '-r', String(RATE), '-o', aiff, spoken(caption)])

    const length = seconds(aiff)
    if (length > gap) {
      // Only ever a rescue. If this fires the chapter needs re-recording with a
      // fresh `measure`, because the caption is on screen for less time than it
      // takes to read out.
      const tempo = Math.min(1.6, length / gap)
      execFileSync('ffmpeg', ['-y', '-i', aiff, '-filter:a', `atempo=${tempo.toFixed(3)}`, wav], { stdio: 'ignore' })
      squeezed += 1
    } else {
      execFileSync('ffmpeg', ['-y', '-i', aiff, wav], { stdio: 'ignore' })
    }
    clips.push({ wav, atMs: caption.atMs })
  })

  const inputs = clips.flatMap((c) => ['-i', c.wav])
  const delays = clips.map((c, n) => `[${n + 1}:a]adelay=${c.atMs}|${c.atMs}[a${n}]`)
  const graph =
    delays.join(';') +
    ';' +
    clips.map((_, n) => `[a${n}]`).join('') +
    `amix=inputs=${clips.length}:normalize=0:duration=longest[voice]`

  execFileSync('ffmpeg', [
    '-y', '-i', videoIn, ...inputs,
    '-filter_complex', graph,
    '-map', '0:v', '-map', '[voice]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '112k', '-shortest', out,
  ], { stdio: 'ignore' })

  rmSync(work, { recursive: true, force: true })
  console.log(`${clips.length} lines narrated, ${squeezed} squeezed to fit -> ${out}`)
  if (squeezed > 0) console.log('run `measure`, re-record, and mix again: squeezed lines talk over the next caption')
}

const [command, ...rest] = process.argv.slice(2)

if (command === 'measure') {
  measure()
} else if (command === 'mix') {
  const [video, captions, out] = rest
  if (!video || !captions || !out) {
    console.error('usage: narrate-demo.mjs mix <video.mp4> <captions.jsonl> <out.mp4>')
    process.exit(1)
  }
  mkdirSync('demo-videos', { recursive: true })
  mix(video, captions, out)
} else {
  console.error('usage: narrate-demo.mjs measure | mix <video> <captions> <out>')
  process.exit(1)
}
