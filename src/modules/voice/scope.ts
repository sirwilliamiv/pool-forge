import type { CommandCategory } from '@/modules/commands/registry'

import { buildToolSurface, type ToolSurface } from './tools'

// What the agent is allowed to do, per screen.
//
// The model is only ever offered the commands that make sense where the user
// actually is. That is not an optimisation: an unavailable tool cannot be
// called, so "price this up" on the dashboard comes back as "I can't do that
// here" instead of running a pricing command against no project.
//
// Same idea as the `availableChoices` filter on the import extractor: constrain
// what can be chosen and a wrong intent fails validation cleanly instead of
// executing something plausible.

export const VOICE_SCREENS = [
  'dashboard',
  'project',
  'editor',
  'import',
  'priceBook',
  'settings',
  'document',
] as const

export type VoiceScreen = (typeof VOICE_SCREENS)[number]

/**
 * Available everywhere.
 *
 * Navigation, because being on the wrong screen is the one thing a user should
 * never have to fix before they can ask to go elsewhere. Reading, because "what
 * does this say" belongs to no particular page.
 */
const ALWAYS: CommandCategory[] = ['navigation', 'palette', 'context']

const BY_SCREEN: Record<VoiceScreen, CommandCategory[]> = {
  dashboard: ['project'],
  project: ['project', 'export'],
  // The editor is the whole point: this is where a pool gets built by voice.
  editor: ['canvas', 'shape', 'measurement', 'pricing', 'validation', 'scene', 'template', 'grade'],
  import: ['import'],
  priceBook: ['pricing', 'settings'],
  settings: ['settings', 'template'],
  document: ['export', 'project'],
}

export interface ScreenScope {
  screen: VoiceScreen
  categories: CommandCategory[]
  surface: ToolSurface
  /** Fast membership test for the session's second-guess check. */
  allows: (commandId: string) => boolean
}

/**
 * Build the tool surface for a screen.
 *
 * The returned `allows` is what the session re-checks each tool call against.
 * Handing the model a scoped surface is not the same as trusting it to stay
 * inside one: it can hallucinate a name, or reach for a tool from a screen the
 * user has since navigated away from.
 */
export function scopeFor(screen: VoiceScreen): ScreenScope {
  const categories = [...ALWAYS, ...(BY_SCREEN[screen] ?? [])]
  const surface = buildToolSurface(categories)
  const allowed = new Set(surface.tools.map(tool => tool.name))

  return {
    screen,
    categories,
    surface,
    allows: (commandId: string) => allowed.has(commandId),
  }
}

/**
 * Map a pathname to a screen.
 *
 * Ordered most specific first: `/projects/x/editor` is the editor, not the
 * project page, and matching the shorter prefix first would give the agent the
 * wrong toolset on the screen that matters most.
 */
export function screenForPath(pathname: string): VoiceScreen {
  if (/^\/projects\/[^/]+\/editor/.test(pathname)) return 'editor'
  if (/^\/projects\/[^/]+\/import/.test(pathname)) return 'import'
  if (/^\/projects\/[^/]+\/(proposal|construction|site-plan|screen-enclosure-quote)/.test(pathname)) {
    return 'document'
  }
  if (/^\/projects\/[^/]+/.test(pathname)) return 'project'
  if (pathname.startsWith('/settings/price-book')) return 'priceBook'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'dashboard'
}
