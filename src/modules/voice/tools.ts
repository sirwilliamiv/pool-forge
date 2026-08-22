// Turning the command registry into a voice tool surface.
//
// `CLAUDE.md` says the registry exists so the app is voice-ready without a
// rewrite. This is where that gets collected: every registered command already
// carries a description, a Zod input schema, and voice examples, so the tool
// declarations are generated rather than hand-written. A command added tomorrow
// is speakable tomorrow, and one that is renamed cannot drift out of sync with a
// second hand-maintained list.
//
// The guard below matters more than the conversion. Per the global note,
// Gemini's JSON-Schema subset cannot express recursive or polymorphic shapes and
// silently emits `{}` for the affected fields, which would let the model call a
// command with garbage and no error anywhere. So a schema that cannot be
// expressed is refused and logged, not published in a mangled form.

import { zodToJsonSchema } from 'zod-to-json-schema'

import { all, type CommandCategory, type EditorCommand } from '@/modules/commands/registry'

/** The subset of JSON Schema the Live API accepts for a function parameter. */
export interface ToolSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

export interface VoiceTool {
  name: string
  description: string
  parameters: ToolSchema
}

export interface RefusedTool {
  name: string
  reason: string
}

export interface ToolSurface {
  tools: VoiceTool[]
  /** Commands that could not be described. Surfaced, never silently dropped. */
  refused: RefusedTool[]
}

/**
 * Collapse the `anyOf: [T, null]` that Zod emits for `.nullable()`.
 *
 * This codebase uses `.nullable()` as a convention rather than `.optional()`, so
 * without this almost every command carrying an optional argument would be
 * refused for a shape that is genuinely expressible: to a caller, "nullable"
 * just means the argument can be left out. Only this exact two-branch form is
 * collapsed; a real union of two value types stays refused, because that is the
 * case Gemini actually cannot represent.
 */
function collapseNullable(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(collapseNullable)
  if (!node || typeof node !== 'object') return node

  const schema = { ...(node as Record<string, unknown>) }

  const branches = schema['anyOf']
  if (Array.isArray(branches) && branches.length === 2) {
    const isNull = (b: unknown) =>
      !!b && typeof b === 'object' && (b as Record<string, unknown>)['type'] === 'null'
    const value = branches.find(b => !isNull(b))
    if (value && branches.some(isNull)) {
      delete schema['anyOf']
      Object.assign(schema, value as Record<string, unknown>)
    }
  }

  for (const [key, value] of Object.entries(schema)) {
    schema[key] = collapseNullable(value)
  }
  return schema
}

/** Types Gemini accepts in a parameter schema. */
const ALLOWED_TYPES = new Set(['object', 'string', 'number', 'integer', 'boolean', 'array'])

/**
 * Reject anything the Live API cannot express.
 *
 * `anyOf` / `oneOf` / `allOf` are the polymorphic shapes that silently become
 * `{}`; `$ref` is the recursive one. Depth is capped because deeply nested
 * arguments are unusable by voice regardless of whether they serialise.
 */
export function describable(node: unknown, depth = 0): string | null {
  if (depth > 4) return 'nested deeper than four levels'
  if (!node || typeof node !== 'object') return null

  const schema = node as Record<string, unknown>

  for (const key of ['anyOf', 'oneOf', 'allOf', '$ref', 'not']) {
    if (key in schema) return `uses ${key}, which Gemini's schema subset cannot express`
  }

  const type = schema['type']
  if (typeof type === 'string' && !ALLOWED_TYPES.has(type)) {
    return `unsupported type "${type}"`
  }
  if (Array.isArray(type)) return 'union type'

  const properties = schema['properties']
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
      const problem = describable(value, depth + 1)
      if (problem) return `${key}: ${problem}`
    }
  }

  const items = schema['items']
  if (items) {
    const problem = describable(items, depth + 1)
    if (problem) return `items: ${problem}`
  }

  return null
}

/**
 * Description the model reads when deciding whether to call this.
 *
 * The voice examples are the useful half: they are already phrased the way a
 * builder would say the thing, which is exactly the signal a speech model needs.
 */
function describeCommand(command: EditorCommand): string {
  const parts = [command.description]
  if (command.voiceExamples?.length) {
    parts.push(`Say things like: ${command.voiceExamples.map(e => `"${e}"`).join(' ')}`)
  }
  return parts.join(' ')
}

/**
 * A command id is a valid function name: Gemini requires names to match
 * `[a-zA-Z0-9_.-]`, and every id in the registry is dotted lowercase already.
 */
function toDeclaration(command: EditorCommand): VoiceTool | RefusedTool {
  let json: Record<string, unknown>
  try {
    json = zodToJsonSchema(command.inputSchema, {
      // Inline everything: a `$ref` to a shared definition is exactly the shape
      // the Live API drops.
      $refStrategy: 'none',
      target: 'jsonSchema7',
    }) as Record<string, unknown>
  } catch (error) {
    return { name: command.id, reason: `schema could not be converted: ${String(error).slice(0, 80)}` }
  }

  json = collapseNullable(json) as Record<string, unknown>

  const problem = describable(json)
  if (problem) return { name: command.id, reason: problem }

  const properties = (json['properties'] as Record<string, unknown> | undefined) ?? {}
  const required = Array.isArray(json['required']) ? (json['required'] as string[]) : undefined

  const parameters: ToolSchema = { type: 'object', properties }
  if (required && required.length > 0) parameters.required = required

  return { name: command.id, description: describeCommand(command), parameters }
}

function isRefused(tool: VoiceTool | RefusedTool): tool is RefusedTool {
  return 'reason' in tool
}

/**
 * Build the tool surface for a set of categories.
 *
 * Scoping is deliberate rather than an optimisation: the model is only offered
 * what is valid where the user actually is, so an out-of-scope request comes back
 * as "I cannot do that here" instead of running a command that had no business
 * running. Commands with no voice examples are excluded, since nothing in the
 * registry describes how a person would ask for them.
 */
export function buildToolSurface(categories: readonly CommandCategory[]): ToolSurface {
  const wanted = new Set(categories)
  const tools: VoiceTool[] = []
  const refused: RefusedTool[] = []

  for (const command of all()) {
    if (!wanted.has(command.category)) continue
    if (!command.voiceExamples?.length) {
      refused.push({ name: command.id, reason: 'no voice examples, so it has no spoken form' })
      continue
    }
    const declaration = toDeclaration(command)
    if (isRefused(declaration)) refused.push(declaration)
    else tools.push(declaration)
  }

  tools.sort((a, b) => a.name.localeCompare(b.name))
  return { tools, refused }
}

/**
 * Commands that change or destroy something the user cannot easily get back.
 *
 * Voice misrecognition plus a destructive command is how somebody loses a
 * drawing, so these are confirmed out loud before they run rather than being
 * dispatched on the first hearing.
 */
const DESTRUCTIVE = new Set([
  'delete.shape',
  'import.session.discard',
  'import.intent.apply',
  'template.scene.apply',
  'template.scene.delete',
  'project.delete',
  'archive.project',
])

export function isDestructive(commandId: string): boolean {
  return DESTRUCTIVE.has(commandId)
}
