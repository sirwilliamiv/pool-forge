import { getStencil } from '@/modules/editor/stencils'

import { loadVoiceConfig, type VoiceConfig } from '../config'
import { scopeFor } from '../scope'
import { startVoiceSession, type CommandOutcome } from '../session'
import type { EvalCase, Expectation, ToolCall } from './cases'

// Running one case against the real model.
//
// The scene is a stand-in for the editor store: enough for `scene.describe` to
// return something true, so a case about positioning relative to an existing
// pool actually tests positioning. Nothing is persisted and no command runs for
// real — what is being measured is which tool the model reaches for and with
// what arguments.

export interface CaseResult {
  id: string
  utterance: string
  passed: boolean
  /** One line per expectation that did not hold. */
  failures: string[]
  calls: ToolCall[]
  spoken: string
  /** Wall-clock from the utterance to the model finishing its turn. */
  ms: number
}

/** How long to wait for a turn to finish before calling it hung. */
const TURN_TIMEOUT_MS = 30_000

/**
 * Quiet period after the last event that means the model has finished.
 *
 * Five seconds, not three. A turn that reads the page and then fills it pauses
 * between the two calls, and a shorter window scored that pause as "the model
 * did nothing" — which showed up as flakiness in the harness rather than in the
 * agent.
 */
const SETTLE_MS = 5_000

interface SceneShape {
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

export async function runCase(testCase: EvalCase, config?: VoiceConfig): Promise<CaseResult> {
  const resolved = config ?? loadVoiceConfig()
  const calls: ToolCall[] = []
  const scene: SceneShape[] = []
  let nextId = 1
  let spoken = ''
  let lastEventAt = Date.now()

  for (const seed of testCase.scene ?? []) {
    scene.push(shapeFrom(seed, `shape-${nextId++}`))
  }

  const started = Date.now()

  const session = await startVoiceSession(
    {
      onAudio: () => {},
      onTranscript: (text, role) => {
        if (role !== 'model') return
        spoken += text
        lastEventAt = Date.now()
      },
      runCommand: async (commandId, args): Promise<CommandOutcome> => {
        lastEventAt = Date.now()
        const record = (args ?? {}) as Record<string, unknown>
        calls.push({ commandId, args: record })
        const data = apply(commandId, record, scene, () => `shape-${nextId++}`)
        const id = (data as Record<string, unknown>)?.['shapeId'] ?? (data as Record<string, unknown>)?.['id']
        return {
          ok: true,
          summary: `${commandId} completed${typeof id === 'string' ? ` (id ${id})` : ''}.`,
          data,
        }
      },
      log: () => {},
    },
    {
      screen: testCase.screen,
      config: resolved,
      ...(testCase.project
        ? { projectId: testCase.project.id, projectName: testCase.project.name }
        : {}),
    },
  )

  session.sendText(testCase.utterance)

  // Settle rather than a fixed sleep: most turns finish in a few seconds, and a
  // fixed wait would make the whole suite as slow as its slowest case.
  const deadline = started + TURN_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(250)
    const quiet = Date.now() - lastEventAt
    if (quiet > SETTLE_MS && (spoken.length > 0 || calls.length > 0)) break
  }

  await session.close()

  const failures = testCase.expect
    .map(expectation => check(expectation, calls))
    .filter((failure): failure is string => failure !== null)

  return {
    id: testCase.id,
    utterance: testCase.utterance,
    passed: failures.length === 0,
    failures,
    calls,
    spoken: spoken.trim(),
    ms: Date.now() - started,
  }
}

/** Judge one expectation. Returns null when it holds, or why it did not. */
function check(expectation: Expectation, calls: ToolCall[]): string | null {
  const matching = calls.filter(call => 'commandId' in expectation && call.commandId === expectation.commandId)

  switch (expectation.kind) {
    case 'callsNothing':
      return calls.length === 0
        ? null
        : `expected no tool call, got ${calls.map(call => call.commandId).join(', ')}`

    case 'calls':
      return matching.length > 0 ? null : `${expectation.commandId} was never called`

    case 'doesNotCall':
      return matching.length === 0
        ? null
        : `${expectation.commandId} was called ${matching.length} time(s) and should not have been`

    case 'callCount':
      return matching.length === expectation.count
        ? null
        : `${expectation.commandId} called ${matching.length} time(s), expected ${expectation.count}`

    case 'arg': {
      if (matching.length === 0) return `${expectation.commandId} was never called`
      const values = matching.map(call => call.args[expectation.path])
      const hit = values.some(
        value => typeof value === 'number' && Math.abs(value - expectation.equals) <= expectation.tolerance,
      )
      return hit
        ? null
        : `${expectation.commandId}.${expectation.path} was ${JSON.stringify(values)}, expected ${expectation.equals} ±${expectation.tolerance}`
    }

    case 'argText': {
      if (matching.length === 0) return `${expectation.commandId} was never called`
      const values = matching.map(call => call.args[expectation.path])
      return values.includes(expectation.equals)
        ? null
        : `${expectation.commandId}.${expectation.path} was ${JSON.stringify(values)}, expected "${expectation.equals}"`
    }
  }
}

function shapeFrom(
  seed: { stencilId: string; x: number; y: number; width?: number; height?: number },
  id: string,
): SceneShape {
  const stencil = getStencil(seed.stencilId)
  const factor = stencil?.defaultDimensions.unit === 'ft' ? 12 : 1
  return {
    id,
    name: stencil?.name ?? seed.stencilId,
    kind: stencil?.shapeKind ?? 'stencil',
    stencilId: seed.stencilId || null,
    x: seed.x,
    y: seed.y,
    width: seed.width ?? (stencil?.defaultDimensions.width ?? 96) * factor,
    height: seed.height ?? (stencil?.defaultDimensions.height ?? 96) * factor,
    rotation: 0,
    locked: false,
    hidden: false,
  }
}

/** Apply a call to the stand-in scene, so reads afterwards tell the truth. */
function apply(
  commandId: string,
  args: Record<string, unknown>,
  scene: SceneShape[],
  nextId: () => string,
): unknown {
  const num = (key: string): number | undefined =>
    typeof args[key] === 'number' ? (args[key] as number) : undefined

  if (commandId === 'add.shape') {
    const shape = shapeFrom(
      {
        stencilId: String(args['stencilId'] ?? ''),
        x: num('x') ?? 0,
        y: num('y') ?? 0,
        ...(num('width') !== undefined ? { width: num('width') as number } : {}),
        ...(num('height') !== undefined ? { height: num('height') as number } : {}),
      },
      nextId(),
    )
    scene.push(shape)
    return { shapeId: shape.id }
  }

  // A stand-in page, so a case about filling a field is graded on whether the
  // agent reached for the right tool with the right labels rather than on an
  // empty document telling it there is nothing to fill.
  if (commandId === 'page.read') {
    return {
      title: 'Phone Demo',
      url: '/projects/proj_eval_1',
      headings: ['Phone Demo', 'Project details'],
      sections: [{ heading: 'Project details', text: 'Salesperson, designer and proposal expiry.' }],
      fields: [
        { label: 'Salesperson', value: '', editable: true, kind: 'text' },
        { label: 'Designer', value: '', editable: true, kind: 'text' },
        { label: 'Proposal expires', value: '', editable: true, kind: 'date' },
        { label: 'Customer', value: 'Jane Whitfield', editable: false, kind: 'display' },
      ],
      tables: [],
      actions: [
        { label: 'Save', destructive: false },
        { label: 'Delete project', destructive: true },
      ],
      truncated: false,
    }
  }

  if (commandId === 'page.click') {
    const label = String(args['label'] ?? '')
    const destructive = /\b(delete|remove|discard|archive)\b/i.test(label)
    if (destructive && args['confirm'] !== true) {
      return {
        label,
        clicked: false,
        reason: `"${label}" will remove something. Ask first.`,
        available: null,
        needsConfirmation: true,
      }
    }
    return { label, clicked: true, reason: null, available: null, needsConfirmation: false }
  }

  if (commandId === 'page.fill') {
    const requested = Array.isArray(args['fields'])
      ? (args['fields'] as { label?: string; value?: string }[])
      : []
    const results = requested.map(field => ({
      label: String(field.label ?? ''),
      value: String(field.value ?? ''),
      filled: true,
      reason: null,
    }))
    return { results, filled: results.length, missed: 0 }
  }

  if (commandId === 'scene.describe') {
    return { count: scene.length, selectedIds: [], shapes: scene, bounds: boundsOf(scene) }
  }

  if (commandId === 'edit.undo') return { undone: true, shapeCount: scene.length }
  if (commandId === 'pool.trim.set') {
    return { id: args['id'] ?? null, coping: args['coping'] !== false, tileBand: args['tileBand'] !== false }
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

  return { id: args['id'] ?? null }
}

function boundsOf(scene: SceneShape[]): { x: number; y: number; width: number; height: number } | null {
  const first = scene[0]
  if (!first) return null
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height
  for (const shape of scene) {
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.width)
    maxY = Math.max(maxY, shape.y + shape.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Tool count per screen, so a shrinking surface shows up in the report. */
export function surfaceSizes(cases: EvalCase[]): Record<string, number> {
  const sizes: Record<string, number> = {}
  for (const screen of new Set(cases.map(testCase => testCase.screen))) {
    sizes[screen] = scopeFor(screen).surface.tools.length
  }
  return sizes
}
