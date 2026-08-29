/**
 * Talk to the real model and check that a sentence becomes a command.
 *
 * Types a turn instead of speaking one, so this exercises everything that is
 * not the microphone: the Vertex connection, the generated tool declarations,
 * scope enforcement, the destructive gate, and the round trip back to the
 * model. Unit tests fake the socket; this is the part they cannot prove.
 *
 *   pnpm voice:smoke                      # default: add a pool in the editor
 *   pnpm voice:smoke "price this up"      # any sentence
 *   pnpm voice:smoke --screen dashboard "open the Whitfield job"
 */

import { initCommands } from '@/modules/commands/init'
import { getStencil } from '@/modules/editor/stencils'
import { loadVoiceConfig, voiceEnabled } from '@/modules/voice/config'
import { scopeFor, VOICE_SCREENS, type VoiceScreen } from '@/modules/voice/scope'
import { startVoiceSession, type CommandOutcome } from '@/modules/voice/session'

initCommands()

const args = process.argv.slice(2)
const screenIndex = args.indexOf('--screen')
const requestedScreen = screenIndex >= 0 ? args[screenIndex + 1] : undefined
const screen: VoiceScreen = isScreen(requestedScreen) ? requestedScreen : 'editor'
// Guard on `screenIndex >= 0`: without it, `screenIndex + 1` is 0 when there is
// no --screen flag and the filter quietly eats the first word of the sentence.
const utterance =
  args
    .filter((_value, index) => screenIndex < 0 || (index !== screenIndex && index !== screenIndex + 1))
    .join(' ') || 'Add a rectangular pool, thirty two feet by sixteen.'

/** Commands the model asked for, so the run can be judged on behaviour. */
const called: { commandId: string; args: unknown }[] = []

interface FakeShape {
  id: string
  name: string
  kind: string
  stencilId: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  locked: boolean
  hidden: boolean
}

/**
 * Just enough canvas for the read-then-place loop to be real.
 *
 * Without it `scene.describe` returns nothing and the model places everything at
 * the origin, which is exactly the bug this script exists to catch. The browser
 * has the actual store; this is a stand-in with the same shape.
 */
const scene: FakeShape[] = []
let nextId = 1

function applyToScene(commandId: string, args: Record<string, unknown>): unknown {
  const num = (key: string): number | undefined =>
    typeof args[key] === 'number' ? (args[key] as number) : undefined

  if (commandId === 'add.shape') {
    const stencilId = String(args['stencilId'] ?? '')
    const stencil = getStencil(stencilId)
    const factor = stencil?.defaultDimensions.unit === 'ft' ? 12 : 1
    const shape: FakeShape = {
      id: `shape-${nextId++}`,
      name: stencil?.name ?? stencilId,
      kind: stencil?.shapeKind ?? 'stencil',
      stencilId: stencilId || null,
      x: num('x') ?? 0,
      y: num('y') ?? 0,
      width: num('width') ?? (stencil?.defaultDimensions.width ?? 96) * factor,
      height: num('height') ?? (stencil?.defaultDimensions.height ?? 96) * factor,
      rotation: 0,
      locked: false,
      hidden: false,
    }
    scene.push(shape)
    return { shapeId: shape.id }
  }

  if (commandId === 'scene.describe') {
    const first = scene[0]
    const bounds = first
      ? scene.reduce(
          (box, shape) => ({
            x: Math.min(box.x, shape.x),
            y: Math.min(box.y, shape.y),
            width: Math.max(box.x + box.width, shape.x + shape.width) - Math.min(box.x, shape.x),
            height: Math.max(box.y + box.height, shape.y + shape.height) - Math.min(box.y, shape.y),
          }),
          { x: first.x, y: first.y, width: first.width, height: first.height },
        )
      : null
    return { count: scene.length, selectedIds: [], shapes: scene, bounds }
  }

  const target = scene.find(shape => shape.id === args['id'])
  if (target) {
    if (commandId === 'move.shape') {
      target.x = num('x') ?? target.x
      target.y = num('y') ?? target.y
    }
    if (commandId === 'resize.shape') {
      target.width = num('width') ?? target.width
      target.height = num('height') ?? target.height
    }
    if (commandId === 'delete.shape') scene.splice(scene.indexOf(target), 1)
  }
  return { id: args['id'] }
}

async function main(): Promise<void> {
  if (!voiceEnabled()) {
    console.error('Voice is off. Set VOICE_LIVE=1 and GCP_PROJECT_ID.')
    process.exit(1)
  }

  const config = loadVoiceConfig()
  const scope = scopeFor(screen)
  console.log(`model ${config.model}`)
  console.log(`screen ${screen} · ${scope.surface.tools.length} tools offered`)
  if (scope.surface.refused.length > 0) {
    console.log(`${scope.surface.refused.length} command(s) have no spoken form on this screen`)
  }
  console.log(`\n> ${utterance}\n`)

  let spoken = ''
  const session = await startVoiceSession(
    {
      // Audio is discarded: this run is about what the model does, not how it
      // sounds. The transcription is what gets printed.
      onAudio: () => {},
      onTranscript: (text, role) => {
        if (role === 'model') {
          spoken += text
          process.stdout.write(text)
        }
      },
      runCommand: async (commandId, commandArgs): Promise<CommandOutcome> => {
        called.push({ commandId, args: commandArgs })
        console.log(`\n  [tool] ${commandId} ${JSON.stringify(commandArgs)}`)
        const data = applyToScene(commandId, (commandArgs ?? {}) as Record<string, unknown>)
        // Mirrors `summarize()` in the browser client: a bare "Done." reads as
        // no confirmation at all and the model repeats the call.
        const record = (data ?? {}) as Record<string, unknown>
        const id = record['shapeId'] ?? record['id']
        return {
          ok: true,
          summary: `${commandId} completed${typeof id === 'string' ? ` (id ${id})` : ''}.`,
          data,
        }
      },
      onClosed: reason => console.log(`\n[closed] ${reason}`),
      log: (event, fields) => console.log(`  [${event}] ${JSON.stringify(fields)}`),
    },
    { screen, config },
  )

  session.sendText(utterance)

  // Long enough for a reply and a tool call, short enough to fail a hung run.
  await new Promise(resolve => setTimeout(resolve, 20_000))
  await session.close()

  console.log('\n\n--- result ---')
  console.log(`spoke: ${spoken.trim() || '(nothing)'}`)
  console.log(`called: ${called.map(c => c.commandId).join(', ') || '(no tools)'}`)
  console.log('scene:')
  for (const shape of scene) {
    const ft = (inches: number) => (inches / 12).toFixed(1)
    console.log(
      `  ${shape.id}  ${shape.name.padEnd(22)} at (${ft(shape.x)}ft, ${ft(shape.y)}ft)  ${ft(shape.width)} x ${ft(shape.height)} ft`,
    )
  }

  if (called.length === 0) {
    console.error('\nThe model answered without calling a tool. Check the declarations.')
    process.exit(1)
  }
}

function isScreen(value: string | undefined): value is VoiceScreen {
  return typeof value === 'string' && (VOICE_SCREENS as readonly string[]).includes(value)
}

void main()
