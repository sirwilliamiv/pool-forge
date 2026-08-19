#!/usr/bin/env tsx
/**
 * Regenerate docs/commands.md from the live command registry.
 * Run with: pnpm tsx scripts/gen-commands.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { initCommands } from '../src/modules/commands/init'
import { all, type CommandCategory, type EditorCommand } from '../src/modules/commands/registry'

const CATEGORY_ORDER: CommandCategory[] = [
  'project',
  'canvas',
  'shape',
  'measurement',
  'pricing',
  'validation',
  'export',
  'template',
  'auth',
  'settings',
  'scene',
  'palette',
  'import',
]

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  project: 'Project',
  canvas: 'Canvas',
  shape: 'Shape',
  measurement: 'Measurement',
  pricing: 'Pricing',
  validation: 'Validation',
  export: 'Export',
  template: 'Template',
  auth: 'Auth',
  settings: 'Settings',
  scene: 'Scene',
  palette: 'Palette',
  import: 'Import',
}

function groupByCategory(
  commands: EditorCommand[],
): Map<CommandCategory, EditorCommand[]> {
  const grouped = new Map<CommandCategory, EditorCommand[]>()
  for (const cmd of commands) {
    const list = grouped.get(cmd.category) ?? []
    list.push(cmd)
    grouped.set(cmd.category, list)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id))
  }
  return grouped
}

function render(commands: EditorCommand[]): string {
  const lines: string[] = []
  lines.push('# Pool Forge Command Reference')
  lines.push('')
  lines.push(
    `Auto-generated from \`src/modules/commands/categories/*\`. Run \`pnpm tsx scripts/gen-commands.ts\` to regenerate. Total commands: **${commands.length}**.`,
  )
  lines.push('')

  const grouped = groupByCategory(commands)
  for (const cat of CATEGORY_ORDER) {
    const list = grouped.get(cat)
    if (!list || list.length === 0) continue
    lines.push(`## ${CATEGORY_LABELS[cat]}`)
    lines.push('')
    for (const cmd of list) {
      lines.push(`### \`${cmd.id}\` — ${cmd.label}`)
      lines.push('')
      lines.push(cmd.description)
      lines.push('')
      if (cmd.voiceExamples && cmd.voiceExamples.length > 0) {
        lines.push('**Voice examples:**')
        for (const ex of cmd.voiceExamples) {
          lines.push(`- "${ex}"`)
        }
        lines.push('')
      }
    }
  }

  return lines.join('\n') + '\n'
}

function main(): void {
  initCommands()
  const commands = all()
  const out = resolve(process.cwd(), 'docs/commands.md')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, render(commands), 'utf8')
  console.log(`Wrote ${commands.length} commands to ${out}`)
}

main()
