import { z } from 'zod'

import { register } from '@/modules/commands/registry'

// Getting around the app.
//
// These are registered like everything else so they work from the command
// palette before any microphone exists, and so voice inherits them for free
// rather than needing a parallel routing layer.
//
// They resolve to a destination and let the client route. Nothing here touches
// the database or `window`: a command that needs a router is still a command,
// and the client handler is what performs the navigation.

/**
 * Where a user can ask to go.
 *
 * An enum rather than a free-text path, deliberately. A model given a string
 * will invent `/projects/settings/pricing` and produce a 404 that reads like a
 * bug; a model given a closed set can only pick something that exists.
 */
export const DESTINATIONS = [
  'dashboard',
  'priceBook',
  'priceBookImport',
  'customerUploads',
  'company',
  'docs',
  'project',
  'editor',
  'import',
  'proposal',
  'constructionPacket',
  'sitePlan',
  'screenEnclosureQuote',
] as const

export type Destination = (typeof DESTINATIONS)[number]

/** Destinations that only mean something in the context of a project. */
const PROJECT_SCOPED = new Set<Destination>([
  'project',
  'editor',
  'import',
  'proposal',
  'constructionPacket',
  'sitePlan',
  'screenEnclosureQuote',
])

const PATHS: Record<Destination, (projectId?: string) => string> = {
  dashboard: () => '/dashboard',
  priceBook: () => '/settings/price-book',
  priceBookImport: () => '/settings/price-book/import',
  customerUploads: () => '/settings/intake',
  company: () => '/settings/company',
  docs: () => '/docs/tools',
  project: id => `/projects/${id}`,
  editor: id => `/projects/${id}/editor`,
  import: id => `/projects/${id}/import`,
  proposal: id => `/projects/${id}/proposal`,
  constructionPacket: id => `/projects/${id}/construction`,
  sitePlan: id => `/projects/${id}/site-plan`,
  screenEnclosureQuote: id => `/projects/${id}/screen-enclosure-quote`,
}

register({
  id: 'nav.goto',
  label: 'Go to',
  description:
    'Navigate to a part of the app. Project-scoped destinations need a project id; if none is given the current project is used.',
  category: 'navigation',
  inputSchema: z.object({
    destination: z.enum(DESTINATIONS),
    projectId: z.string().optional(),
  }),
  outputSchema: z.object({ path: z.string(), destination: z.string() }),
  voiceExamples: [
    'Go to the price book.',
    'Open customer uploads.',
    'Take me to the editor.',
    'Show me the proposal.',
    'Back to the dashboard.',
  ],
  execute: async input => {
    const needsProject = PROJECT_SCOPED.has(input.destination)
    if (needsProject && !input.projectId) {
      // Named, not generic: "which project?" is a question a person can answer,
      // where "invalid input" is not.
      return {
        ok: false,
        error: `"${input.destination}" belongs to a project. Open a project first, or say which one.`,
      }
    }
    return {
      ok: true,
      data: { path: PATHS[input.destination](input.projectId), destination: input.destination },
    }
  },
})

register({
  id: 'nav.openProject',
  label: 'Open project by name',
  description:
    'Find a project by customer or project name and open it. Reports the matches when more than one fits, rather than guessing.',
  category: 'navigation',
  inputSchema: z.object({
    query: z.string().min(1),
    /** Where in the project to land. The editor is the usual intent. */
    destination: z.enum(['project', 'editor', 'import', 'proposal']).default('project'),
  }),
  outputSchema: z.object({
    path: z.string(),
    projectId: z.string(),
    projectName: z.string(),
  }),
  voiceExamples: [
    'Open the Whitfield job.',
    'Pull up the Smith residence.',
    'Open the Henderson project in the editor.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const { db } = await import('@/lib/db')
    const matches = await db.project.findMany({
      where: {
        orgId: ctx.orgId,
        OR: [
          { name: { contains: input.query, mode: 'insensitive' } },
          { customer: { name: { contains: input.query, mode: 'insensitive' } } },
        ],
      },
      // Recently touched first: asked by a half-remembered name, the job someone
      // worked on this morning is the likely one. Explicit tiebreaker keeps the
      // order stable across reads.
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, name: true },
      take: 6,
    })

    if (matches.length === 0) {
      return { ok: false, error: `No project matches "${input.query}".` }
    }

    // Ambiguity is reported by name, never resolved by guessing. Opening the
    // wrong customer's job is worse than asking.
    if (matches.length > 1) {
      const names = matches.map(m => m.name).join(', ')
      return { ok: false, error: `More than one project matches "${input.query}": ${names}. Which one?` }
    }

    const project = matches[0]
    if (!project) return { ok: false, error: `No project matches "${input.query}".` }

    // The Zod default is applied on parse, but the registry infers the input
    // side of the schema, so the field is still optional to TypeScript here.
    const destination: Destination = input.destination ?? 'project'

    return {
      ok: true,
      data: {
        path: PATHS[destination](project.id),
        projectId: project.id,
        projectName: project.name,
      },
    }
  },
})

register({
  id: 'nav.setView',
  label: 'Change the view',
  description: 'Switch the editor between the plan, 3D and section views of the same scene.',
  category: 'navigation',
  inputSchema: z.object({ view: z.enum(['plan', '3d', 'section']) }),
  outputSchema: z.object({ view: z.string() }),
  voiceExamples: ['Switch to plan view.', 'Show me the 3D.', 'Give me a section.'],
  execute: async input => ({ ok: true, data: { view: input.view } }),
})

register({
  id: 'nav.setMode',
  label: 'Change the mode',
  description:
    'Switch the editor between plan, design, build and customer presentation modes.',
  category: 'navigation',
  inputSchema: z.object({ mode: z.enum(['plan', 'design', 'build', 'customer']) }),
  outputSchema: z.object({ mode: z.string() }),
  voiceExamples: [
    'Put it in customer mode.',
    'Switch to build mode.',
    'Show me what the customer sees.',
  ],
  execute: async input => ({ ok: true, data: { mode: input.mode } }),
})

register({
  id: 'nav.focus',
  label: 'Focus a panel',
  description:
    'Bring a panel or section into view and highlight it, for when someone asks to be shown where something is.',
  category: 'navigation',
  inputSchema: z.object({
    target: z.enum([
      'layers',
      'stencils',
      'materials',
      'quote',
      'specs',
      'validation',
      'measurements',
      'sunStudy',
    ]),
  }),
  outputSchema: z.object({ target: z.string() }),
  voiceExamples: ['Show me the quote.', 'Highlight the validation issues.', 'Open the materials panel.'],
  execute: async input => ({ ok: true, data: { target: input.target } }),
})
