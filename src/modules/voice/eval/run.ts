import { getStencil } from '@/modules/editor/stencils'

import { loadVoiceConfig, type VoiceConfig } from '../config'
import { scopeFor, type VoiceScreen } from '../scope'
import { startVoiceSession, type CommandOutcome } from '../session'
import type { EvalCase, Expectation, ToolCall } from './cases'

// Running one case against the real model.
//
// The stand-in world below is a substitute for the editor store, the current
// page and the site grade: enough for a read to return something true, so a
// case about positioning relative to an existing pool, or about filling a field
// that is not editable, actually tests that. Nothing is persisted and no command
// runs for real. What is being measured is which tool the model reaches for and
// with what arguments.
//
// A read that returns an empty document is the failure mode this exists to
// avoid: the agent then has nothing to act on, does nothing, and the case grades
// the harness rather than the agent.

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
 * did nothing" - which showed up as flakiness in the harness rather than in the
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

interface GradePoint {
  id: string
  x: number
  y: number
  elevationFt: number
  label: string | null
}

interface GradeSurface {
  baseElevationFt: number
  points: GradePoint[]
}

interface GradeState {
  enabled: boolean
  existing: GradeSurface
  finished: GradeSurface
  falloff: number
}

interface StandInField {
  label: string
  value: string
  editable: boolean
  kind: string
  choices?: string[]
}

interface StandInTable {
  caption: string | null
  headers: string[]
  rows: string[][]
  truncatedRows: number
}

interface StandInPage {
  title: string
  url: string
  headings: string[]
  sections: { heading: string; text: string }[]
  fields: StandInField[]
  tables: StandInTable[]
  actions: { label: string; destructive: boolean }[]
  truncated: boolean
}

interface TemplateRow {
  id: string
  name: string
  description: string | null
  objectCount: number
  isDefault: boolean
  updatedAt: string
}

/** Everything a read can look at, and everything a write can change. */
interface World {
  screen: VoiceScreen
  scene: SceneShape[]
  selected: string[]
  grade: GradeState
  templates: TemplateRow[]
  page: StandInPage
  nextShapeId: () => string
  nextGradeId: () => string
}

export async function runCase(testCase: EvalCase, config?: VoiceConfig): Promise<CaseResult> {
  const resolved = config ?? loadVoiceConfig()
  const calls: ToolCall[] = []
  const scene: SceneShape[] = []
  let nextId = 1
  let nextGrade = 1
  let spoken = ''
  let lastEventAt = Date.now()

  for (const seed of testCase.scene ?? []) {
    scene.push(shapeFrom(seed, `shape-${nextId++}`))
  }

  const world: World = {
    screen: testCase.screen,
    scene,
    selected: [],
    grade: {
      enabled: false,
      existing: { baseElevationFt: 0, points: [] },
      finished: { baseElevationFt: 0, points: [] },
      falloff: 2,
    },
    templates: standInTemplates(),
    page: standInPage(testCase.screen, testCase.project?.name ?? 'Phone Demo'),
    nextShapeId: () => `shape-${nextId++}`,
    nextGradeId: () => `grade-${nextGrade++}`,
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
        const data = apply(commandId, record, world)
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
        : `${expectation.commandId}.${expectation.path} was ${JSON.stringify(values)}, expected ${expectation.equals} +/-${expectation.tolerance}`
    }

    case 'argText': {
      if (matching.length === 0) return `${expectation.commandId} was never called`
      const values = matching.map(call => call.args[expectation.path])
      return values.includes(expectation.equals)
        ? null
        : `${expectation.commandId}.${expectation.path} was ${JSON.stringify(values)}, expected "${expectation.equals}"`
    }

    // Booleans need their own case: `arg` compares numbers, and a confirmation
    // flag or a "leave the coping on" flag is exactly the argument where getting
    // it backwards is silent and expensive.
    case 'argFlag': {
      if (matching.length === 0) return `${expectation.commandId} was never called`
      const values = matching.map(call => call.args[expectation.path])
      return values.includes(expectation.equals)
        ? null
        : `${expectation.commandId}.${expectation.path} was ${JSON.stringify(values)}, expected ${expectation.equals}`
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

/**
 * Saved layouts the agent can find by name.
 *
 * Present so a "drop in the standard equipment pad" case is graded on whether
 * the agent looked the name up instead of inventing a template id. With an empty
 * list there is nothing to look up and the case grades an error message.
 */
function standInTemplates(): TemplateRow[] {
  return [
    {
      id: 'tpl_equipment_pad',
      name: 'Standard equipment pad',
      description: 'Pad, pump, filter, heater and the gas line note.',
      objectCount: 6,
      isDefault: true,
      updatedAt: '2026-05-02T14:10:00.000Z',
    },
    {
      id: 'tpl_courtyard',
      name: 'Courtyard starter',
      description: 'House wall, fence line and two loungers.',
      objectCount: 9,
      isDefault: false,
      updatedAt: '2026-04-11T09:35:00.000Z',
    },
    {
      id: 'tpl_screen_cage',
      name: 'Screen cage shell',
      description: 'Cage outline with the door on the long side.',
      objectCount: 4,
      isDefault: false,
      updatedAt: '2026-03-19T16:02:00.000Z',
    },
  ]
}

/**
 * The page under the agent, per screen.
 *
 * One page per screen rather than one page for everything: a case that asks what
 * the salt cell costs on the price book used to be answered from the project
 * page's field list, which meant it graded nothing. The read-only Customer field
 * and the destructive Delete button are here on purpose too, so refusing to fill
 * or to press them is a real outcome rather than an assumption.
 */
function standInPage(screen: VoiceScreen, projectName: string): StandInPage {
  if (screen === 'priceBook') {
    return {
      title: 'Price book',
      url: '/settings/price-book',
      headings: ['Price book', 'Equipment', 'Materials'],
      sections: [{ heading: 'Equipment', text: 'Pumps, filters, heaters and sanitisers.' }],
      fields: [{ label: 'Markup', value: '32%', editable: true, kind: 'text' }],
      tables: [
        {
          caption: 'Equipment',
          headers: ['Item', 'Unit', 'Cost', 'Retail'],
          rows: [
            ['Salt cell', 'each', '780.00', '1450.00'],
            ['Variable speed pump', 'each', '950.00', '1780.00'],
            ['Heater, 400k BTU', 'each', '2100.00', '3400.00'],
            ['Cartridge filter', 'each', '410.00', '760.00'],
          ],
          truncatedRows: 380,
        },
      ],
      actions: [
        { label: 'Add item', destructive: false },
        { label: 'Import CSV', destructive: false },
      ],
      // True on purpose: a four hundred row book does not arrive whole, and the
      // agent should say so rather than implying it read all of it.
      truncated: true,
    }
  }

  if (screen === 'import') {
    return {
      title: 'Import survey',
      url: '/projects/proj_eval_1/import',
      headings: ['Import survey', 'What was found'],
      sections: [
        {
          heading: 'What was found',
          text: 'One survey page. Lot lines, a house footprint and a rear setback were detected. Scale not set.',
        },
      ],
      fields: [
        { label: 'Scale', value: '', editable: true, kind: 'text' },
        { label: 'Source', value: 'whitfield-survey.pdf', editable: false, kind: 'display' },
      ],
      tables: [
        {
          caption: 'Detected objects',
          headers: ['Kind', 'Confidence'],
          rows: [
            ['Property line', '0.91'],
            ['House wall', '0.88'],
            ['Rear setback', '0.62'],
          ],
          truncatedRows: 0,
        },
      ],
      actions: [
        { label: 'Apply to project', destructive: false },
        { label: 'Discard import', destructive: true },
      ],
      truncated: false,
    }
  }

  if (screen === 'dashboard') {
    return {
      title: 'Projects',
      url: '/dashboard',
      headings: ['Projects'],
      sections: [{ heading: 'Projects', text: 'Recently updated jobs.' }],
      fields: [],
      tables: [
        {
          caption: 'Recent',
          headers: ['Project', 'Customer', 'Updated'],
          rows: [
            ['Whitfield Residence', 'Jane Whitfield', 'Yesterday'],
            [projectName, 'Demo customer', 'Today'],
          ],
          truncatedRows: 0,
        },
      ],
      actions: [{ label: 'New project', destructive: false }],
      truncated: false,
    }
  }

  if (screen === 'editor') {
    return {
      title: `${projectName} - editor`,
      url: '/projects/proj_eval_1/editor',
      headings: [projectName, 'Design'],
      sections: [{ heading: 'Design', text: 'Plan view with the stencil palette and the layers panel.' }],
      fields: [{ label: 'Drawing name', value: projectName, editable: true, kind: 'text' }],
      tables: [],
      actions: [{ label: 'Save', destructive: false }],
      truncated: false,
    }
  }

  return {
    title: projectName,
    url: '/projects/proj_eval_1',
    headings: [projectName, 'Project details'],
    sections: [{ heading: 'Project details', text: 'Salesperson, designer and proposal expiry.' }],
    fields: [
      { label: 'Salesperson', value: '', editable: true, kind: 'text' },
      { label: 'Designer', value: '', editable: true, kind: 'text' },
      { label: 'Proposal expires', value: '', editable: true, kind: 'date' },
      // Not editable anywhere but the customer record. Filling it must fail.
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

/** Apply a call to the stand-in world, so reads afterwards tell the truth. */
function apply(commandId: string, args: Record<string, unknown>, world: World): unknown {
  const { scene, grade, page } = world

  const num = (key: string): number | undefined =>
    typeof args[key] === 'number' ? (args[key] as number) : undefined
  const str = (key: string): string | undefined =>
    typeof args[key] === 'string' ? (args[key] as string) : undefined
  const flag = (key: string): boolean | undefined =>
    typeof args[key] === 'boolean' ? (args[key] as boolean) : undefined

  // ---- canvas -----------------------------------------------------------

  if (commandId === 'add.shape') {
    const shape = shapeFrom(
      {
        stencilId: String(args['stencilId'] ?? ''),
        x: num('x') ?? 0,
        y: num('y') ?? 0,
        ...(num('widthFt') !== undefined ? { width: num('widthFt') as number } : {}),
        ...(num('height') !== undefined ? { height: num('height') as number } : {}),
      },
      world.nextShapeId(),
    )
    scene.push(shape)
    return { shapeId: shape.id }
  }

  if (commandId === 'scene.describe') {
    return { count: scene.length, selectedIds: world.selected, shapes: scene, bounds: boundsOf(scene) }
  }

  if (commandId === 'canvas.zoom.in') return { zoom: 1.25 }
  if (commandId === 'canvas.zoom.out') return { zoom: 0.8 }
  if (commandId === 'canvas.fit') return { zoom: 0.62 }
  if (commandId === 'canvas.pan') return { x: num('dx') ?? 0, y: num('dy') ?? 0 }
  if (commandId === 'camera.frame.selection') return { framed: world.selected.length > 0 }
  if (commandId === 'camera.set.view') return { view: str('view') ?? 'top' }
  if (commandId === 'view.set.tab') return { tab: str('tab') ?? 'plan' }
  if (commandId === 'mode.set.presentation') return { mode: str('mode') ?? 'design' }
  if (commandId === 'tool.activate') return { tool: str('tool') ?? 'select' }
  if (commandId === 'sun.set.time') return { minutesPastMidnight: num('minutesPastMidnight') ?? 720 }
  if (commandId === 'sun.run.study') return { started: true }

  if (commandId === 'selection.set' || commandId === 'select.shape') {
    const ids = Array.isArray(args['ids']) ? (args['ids'] as unknown[]).map(String) : []
    world.selected = args['additive'] === true ? [...world.selected, ...ids] : ids
    return { selectedIds: world.selected }
  }

  // Undo and redo report a shape count so the agent can tell whether anything
  // actually came back, rather than trusting its own memory of the scene.
  if (commandId === 'edit.undo') return { undone: true, shapeCount: scene.length }
  if (commandId === 'edit.redo') return { redone: true, shapeCount: scene.length }

  // ---- reading and driving the page -------------------------------------

  if (commandId === 'page.read') {
    const query = (str('query') ?? '').trim().toLowerCase()
    if (!query) return page
    const has = (text: string): boolean => text.toLowerCase().includes(query)
    return {
      ...page,
      sections: page.sections.filter(section => has(section.heading) || has(section.text)),
      fields: page.fields.filter(field => has(field.label) || has(field.value)),
      tables: page.tables
        .map(table => ({ ...table, rows: table.rows.filter(row => row.some(has)) }))
        .filter(table => table.rows.length > 0),
    }
  }

  if (commandId === 'page.fill') {
    const requested = Array.isArray(args['fields'])
      ? (args['fields'] as { label?: string; value?: string }[])
      : []
    const results = requested.map(request => {
      const label = String(request.label ?? '')
      const value = String(request.value ?? '')
      const field = page.fields.find(candidate => candidate.label.toLowerCase() === label.toLowerCase())
      if (!field) {
        return {
          label,
          value,
          filled: false,
          reason: `No field called "${label}" on this page. There is ${page.fields.map(f => f.label).join(', ') || 'nothing editable here'}.`,
        }
      }
      if (!field.editable) {
        return { label, value, filled: false, reason: `"${field.label}" is shown here but cannot be changed on this page.` }
      }
      field.value = value
      return { label: field.label, value, filled: true, reason: null }
    })
    return {
      results,
      filled: results.filter(result => result.filled).length,
      missed: results.filter(result => !result.filled).length,
    }
  }

  if (commandId === 'page.click') {
    const label = str('label') ?? ''
    const action = page.actions.find(candidate => candidate.label.toLowerCase() === label.toLowerCase())
    if (!action) {
      return {
        label,
        clicked: false,
        reason: `There is no "${label}" button on this page.`,
        available: page.actions.map(candidate => candidate.label),
        needsConfirmation: false,
      }
    }
    if (action.destructive && args['confirm'] !== true) {
      return {
        label: action.label,
        clicked: false,
        reason: `"${action.label}" will remove something. Ask first.`,
        available: null,
        needsConfirmation: true,
      }
    }
    return { label: action.label, clicked: true, reason: null, available: null, needsConfirmation: false }
  }

  // ---- site grade -------------------------------------------------------

  if (commandId === 'grade.enable') {
    grade.enabled = flag('enabled') ?? true
    return { enabled: grade.enabled }
  }

  if (commandId === 'grade.point.add') {
    const surface = str('surface') === 'finished' ? grade.finished : grade.existing
    const point: GradePoint = {
      id: world.nextGradeId(),
      x: num('xFt') ?? 0,
      y: num('yFt') ?? 0,
      elevationFt: num('elevationFt') ?? 0,
      label: str('label') ?? null,
    }
    surface.points.push(point)
    grade.enabled = true
    return { pointId: point.id, surface: str('surface') ?? 'existing', count: surface.points.length }
  }

  if (commandId === 'grade.point.update' || commandId === 'grade.point.remove') {
    const surface = str('surface') === 'finished' ? grade.finished : grade.existing
    const pointId = str('pointId') ?? ''
    const index = surface.points.findIndex(point => point.id === pointId)
    const found = index >= 0 ? surface.points[index] : undefined
    if (found && commandId === 'grade.point.remove') surface.points.splice(index, 1)
    if (found && commandId === 'grade.point.update') {
      found.x = num('x') ?? found.x
      found.y = num('y') ?? found.y
      found.elevationFt = num('elevationFt') ?? found.elevationFt
      found.label = str('label') ?? found.label
    }
    return { pointId }
  }

  if (commandId === 'grade.base.set') {
    const name = str('surface') === 'finished' ? 'finished' : 'existing'
    const surface = name === 'finished' ? grade.finished : grade.existing
    surface.baseElevationFt = num('elevationFt') ?? surface.baseElevationFt
    return { surface: name, elevationFt: surface.baseElevationFt }
  }

  if (commandId === 'grade.falloff.set') {
    grade.falloff = num('falloff') ?? grade.falloff
    return { surface: str('surface') ?? 'finished', falloff: grade.falloff }
  }

  if (commandId === 'grade.describe') return describeGrade(world)

  if (commandId === 'shape.elevation.set') {
    return { id: str('id') ?? null, elevationFt: num('elevationFt') ?? 0 }
  }

  // ---- measurements, pricing, validation --------------------------------

  if (commandId === 'calculate.measurements') return measurementsOf(scene)
  if (commandId === 'run.validation') {
    return {
      errors: 0,
      warnings: 1,
      passes: 14,
      problems: [
        { level: 'warning', message: 'The pool sits 3 ft from the rear setback line and 5 ft is required.' },
        { level: 'info', message: 'No main drain has been placed.' },
      ],
    }
  }
  if (commandId === 'generate.quote') {
    const subtotal = 42_000 + scene.length * 1_800
    const taxAmount = Math.round(subtotal * 0.07)
    return {
      total: subtotal + taxAmount,
      subtotal,
      taxAmount,
      lineCount: 6 + scene.length,
      topLines: [
        { name: 'Excavation and shell', total: 18_400 },
        { name: 'Paver deck', total: 9_600 },
        { name: 'Equipment package', total: 7_300 },
      ],
    }
  }
  if (commandId === 'select.equipment') {
    return { projectId: str('projectId') ?? 'proj_eval_1', selections: args['selections'] ?? {} }
  }
  if (commandId === 'add.priceBookItem') return { itemId: 'pbi_stand_in' }

  // ---- saved layouts ----------------------------------------------------

  if (commandId === 'template.scene.list') return { templates: world.templates }

  if (commandId === 'template.scene.save') {
    const row: TemplateRow = {
      id: `tpl_${world.templates.length + 1}`,
      name: str('name') ?? 'Untitled layout',
      description: str('description') ?? null,
      objectCount: scene.length,
      isDefault: false,
      updatedAt: new Date().toISOString(),
    }
    world.templates.push(row)
    return { templateId: row.id, objectCount: row.objectCount }
  }

  if (commandId === 'template.scene.apply') {
    const template = world.templates.find(row => row.id === str('templateId'))
    if (!template) {
      return { added: 0, total: scene.length, replaced: 0, reason: 'No template with that id. List them first.' }
    }
    // Replace throws away the drawing. Refusing it unconfirmed here is what makes
    // the "wipe the canvas" case a real test rather than a no-op.
    if (str('mode') === 'replace' && args['confirmReplace'] !== true) {
      return {
        added: 0,
        total: scene.length,
        replaced: 0,
        reason: `Replacing would remove the ${scene.length} object(s) already drawn. Confirm first.`,
      }
    }
    const replaced = str('mode') === 'replace' ? scene.splice(0, scene.length).length : 0
    for (let index = 0; index < template.objectCount; index++) {
      scene.push(shapeFrom({ stencilId: 'symbol.equipment-pad', x: 600 + index * 24, y: 600 }, world.nextShapeId()))
    }
    return { added: template.objectCount, total: scene.length, replaced }
  }

  if (commandId === 'template.scene.setDefault') return { templateId: str('templateId') ?? null }

  if (commandId === 'template.scene.delete') {
    const index = world.templates.findIndex(row => row.id === str('templateId'))
    if (index >= 0) world.templates.splice(index, 1)
    return { deleted: index >= 0 }
  }

  if (commandId === 'apply.shapeTemplate') {
    const shape = shapeFrom({ stencilId: 'symbol.equipment-pad', x: num('x') ?? 0, y: num('y') ?? 0 }, world.nextShapeId())
    scene.push(shape)
    return { shapeId: shape.id }
  }
  if (commandId === 'save.shapeTemplate') return { templateId: 'shape_tpl_stand_in' }

  // ---- exports and import ----------------------------------------------

  if (commandId.startsWith('export.')) {
    return { exportId: 'exp_stand_in', url: '/exports/exp_stand_in.pdf' }
  }
  if (commandId === 'import.session.create') return { sessionId: 'imp_stand_in', status: 'DRAFT' }
  if (commandId === 'import.calibrate.set') {
    return { sessionId: str('sessionId') ?? 'imp_stand_in', pixelsPerInch: num('pixelsPerInch') ?? 0 }
  }
  if (commandId === 'import.intent.apply') {
    return {
      sessionId: str('sessionId') ?? 'imp_stand_in',
      projectId: str('projectId') ?? 'proj_eval_1',
      appliedCommandIds: [],
      createdShapeIds: [],
    }
  }
  if (commandId === 'import.session.discard') {
    return { sessionId: str('sessionId') ?? 'imp_stand_in', status: 'DISCARDED' }
  }

  // ---- navigation and projects -----------------------------------------

  if (commandId === 'nav.goto') return { path: '/', destination: str('destination') ?? 'dashboard' }
  if (commandId === 'nav.openProject') {
    return { path: '/projects/proj_eval_1', projectId: 'proj_eval_1', projectName: 'Whitfield Residence' }
  }
  if (commandId === 'nav.focus') return { target: str('target') ?? 'layers' }
  if (commandId === 'palette.open') return { opened: true }
  if (commandId === 'create.project') {
    return { projectId: 'proj_new_stand_in', name: str('name') ?? 'New project', path: '/projects/proj_new_stand_in' }
  }
  if (commandId === 'save.project') return { savedAt: new Date().toISOString() }
  if (commandId === 'settings.update') return { key: str('key') ?? '', value: args['value'] ?? null }

  // ---- shape edits that need a target ----------------------------------

  if (commandId === 'pool.trim.set') {
    return { id: args['id'] ?? null, coping: flag('coping') ?? true, tileBand: flag('tileBand') ?? true }
  }

  const target = scene.find(shape => shape.id === args['id'])
  if (!target) {
    // Named rather than generic: the agent's next move should be to read the
    // scene, and "no shape with that id" is what tells it to.
    return { id: args['id'] ?? null, ok: false, reason: `No shape with id ${String(args['id'])} is on the canvas.` }
  }

  if (commandId === 'move.shape') {
    const relative = args['relative'] === true
    target.x = relative ? target.x + (num('x') ?? 0) : num('x') ?? target.x
    target.y = relative ? target.y + (num('y') ?? 0) : num('y') ?? target.y
    return { id: target.id, x: target.x, y: target.y }
  }
  if (commandId === 'resize.shape') {
    target.width = num('widthFt') ?? target.width
    target.height = num('height') ?? target.height
    return { id: target.id, width: target.width, height: target.height }
  }
  if (commandId === 'rotate.shape') {
    target.rotation = args['relative'] === true ? target.rotation + (num('degrees') ?? 0) : num('degrees') ?? target.rotation
    return { id: target.id, degrees: target.rotation }
  }
  if (commandId === 'delete.shape') {
    const ids = Array.isArray(args['ids']) ? (args['ids'] as unknown[]).map(String) : [target.id]
    const deleted: string[] = []
    for (const id of ids) {
      const index = scene.findIndex(shape => shape.id === id)
      if (index >= 0) deleted.push(...scene.splice(index, 1).map(shape => shape.id))
    }
    return { deletedIds: deleted }
  }
  if (commandId === 'duplicate.shape') {
    const copy = { ...target, id: world.nextShapeId(), x: target.x + (num('offsetX') ?? 24), y: target.y + (num('offsetY') ?? 24) }
    scene.push(copy)
    return { sourceId: target.id, newId: copy.id }
  }
  if (commandId === 'shape.rename') {
    target.name = str('name') ?? target.name
    return { id: target.id, name: target.name }
  }
  if (commandId === 'shape.hide') {
    target.hidden = flag('hidden') ?? true
    return { id: target.id, hidden: target.hidden }
  }
  if (commandId === 'shape.lock') {
    target.locked = flag('locked') ?? true
    return { id: target.id, locked: target.locked }
  }
  if (commandId === 'pool.flip') return { id: target.id, axis: str('axis') ?? 'x' }
  if (commandId === 'pool.shape.set') return { id: target.id, poolShape: str('poolShape') ?? 'rectangle' }
  if (commandId === 'pool.lock.ratio') return { id: target.id, locked: flag('locked') ?? true }
  if (commandId === 'set.shape.material' || commandId === 'pool.material.set') {
    return { id: target.id, slot: str('slot') ?? 'interior', materialId: str('materialId') ?? '' }
  }

  // Feet in, inches on the canvas. Doing the conversion here rather than echoing
  // the input is what lets a follow-up scene.describe expose a model that passed
  // 360 when it meant 30 feet.
  if (commandId === 'pool.geometry.update') {
    if (num('lengthFt') !== undefined) target.width = (num('lengthFt') as number) * 12
    if (num('widthFt') !== undefined) target.height = (num('widthFt') as number) * 12
    return {
      id: target.id,
      lengthFt: round(target.width / 12),
      widthFt: round(target.height / 12),
      ...(num('avgDepth') !== undefined ? { avgDepthFt: num('avgDepth') } : {}),
      ...(num('shallowDepth') !== undefined ? { shallowDepthFt: num('shallowDepth') } : {}),
      ...(num('deepDepth') !== undefined ? { deepDepthFt: num('deepDepth') } : {}),
    }
  }

  if (commandId === 'set.pool.depth') {
    return { id: target.id, shallow: num('shallow') ?? null, deep: num('deep') ?? null }
  }

  if (commandId === 'set.pool.targetArea') {
    const wanted = num('targetArea') ?? 0
    const current = (target.width / 12) * (target.height / 12)
    const factor = current > 0 && wanted > 0 ? Math.sqrt(wanted / current) : 1
    target.width = Math.round(target.width * factor)
    target.height = Math.round(target.height * factor)
    const lengthFt = target.width / 12
    const widthFt = target.height / 12
    return {
      id: target.id,
      width: round(lengthFt),
      height: round(widthFt),
      area: round(lengthFt * widthFt),
      perimeter: round(2 * (lengthFt + widthFt)),
    }
  }

  return { id: args['id'] ?? null }
}

/** Cut and fill from whatever shots have been taken so far. */
function describeGrade(world: World): unknown {
  const { grade, scene } = world
  const elevations = [...grade.existing.points, ...grade.finished.points].map(point => point.elevationFt)
  const reliefFt = elevations.length > 1 ? Math.max(...elevations) - Math.min(...elevations) : 0
  const bounds = boundsOf(scene)
  const areaSqFt = bounds ? (bounds.width / 12) * (bounds.height / 12) : 0
  const dropFt = grade.finished.baseElevationFt - grade.existing.baseElevationFt
  const netYards = round((areaSqFt * dropFt) / 27)
  return {
    enabled: grade.enabled,
    existing: { baseElevationFt: grade.existing.baseElevationFt, points: grade.existing.points },
    finished: { baseElevationFt: grade.finished.baseElevationFt, points: grade.finished.points },
    cutYards: netYards < 0 ? Math.abs(netYards) : 0,
    fillYards: netYards > 0 ? netYards : 0,
    netYards,
    reliefFt: round(reliefFt),
    maxSlopePct: round(reliefFt > 0 ? (reliefFt / 50) * 100 : 0),
  }
}

function measurementsOf(scene: SceneShape[]): unknown {
  const pool = scene.find(shape => (shape.stencilId ?? '').startsWith('pool.'))
  const lengthFt = pool ? pool.width / 12 : 0
  const widthFt = pool ? pool.height / 12 : 0
  const surfaceArea = round(lengthFt * widthFt)
  const perimeter = round(2 * (lengthFt + widthFt))
  const avgDepth = 5
  const deckArea = round(
    scene
      .filter(shape => (shape.stencilId ?? '').startsWith('deck.'))
      .reduce((total, shape) => total + (shape.width / 12) * (shape.height / 12), 0),
  )
  return {
    hasPool: pool !== undefined,
    poolLengthFt: round(lengthFt),
    poolWidthFt: round(widthFt),
    poolSurfaceArea: surfaceArea,
    poolPerimeter: perimeter,
    poolGallons: Math.round(surfaceArea * avgDepth * 7.48),
    poolAvgDepth: avgDepth,
    deckArea,
    copingLinearFeet: perimeter,
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
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
