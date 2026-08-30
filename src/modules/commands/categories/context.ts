import { z } from 'zod'

import { get, register } from '@/modules/commands/registry'

// Reading the screen.
//
// Available everywhere, like navigation, because "what does this say" is not a
// question that belongs to one page. The alternative was a hand-written reader
// per screen, which covers the pages somebody remembered and silently fails on
// every page added afterwards.

register({
  id: 'page.read',
  runsOn: 'client',
  label: 'Read the current page',
  description:
    'Read what is currently on screen: headings, the text under them, table rows, labelled values, and the buttons available. Each field says whether it is editable and what kind it is (text, email, date, checkbox, select), so use this before page.fill to learn the exact labels and formats. Pass a query to narrow a long page rather than reading all of it.',
  category: 'context',
  inputSchema: z.object({
    /**
     * Words to narrow by. A filter, not a search engine: a price book with four
     * hundred rows otherwise arrives as four hundred rows, and the answer is
     * buried in it.
     */
    query: z.string().optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    url: z.string(),
    headings: z.array(z.string()),
    sections: z.array(z.object({ heading: z.string(), text: z.string() })),
    fields: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        /** False for a value that is only displayed; page.fill cannot change it. */
        editable: z.boolean(),
        /** text, email, date, checkbox, select… so values are formatted correctly. */
        kind: z.string(),
        choices: z.array(z.string()).optional(),
      }),
    ),
    /** Buttons on the page, so the agent knows what it can actually do here. */
    actions: z.array(z.object({ label: z.string(), destructive: z.boolean() })),
    tables: z.array(
      z.object({
        caption: z.string().nullable(),
        headers: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        truncatedRows: z.number(),
      }),
    ),
    /** Say so out loud when true, rather than implying the reading was complete. */
    truncated: z.boolean(),
  }),
  voiceExamples: [
    'What does this page say?',
    'What am I looking at?',
    'Read me the quote.',
    'What does the salt cell cost?',
    'How many projects are on this list?',
    'What is the customer address on here?',
  ],
  // CLIENT: readPage(document, input.query). Runs in the browser because the
  // rendered page is the only place this information exists as the user sees it.
  execute: async () => ({
    ok: true,
    data: {
      title: '',
      url: '',
      headings: [],
      sections: [],
      fields: [],
      tables: [],
      actions: [],
      truncated: false,
    },
  }),
})

register({
  id: 'page.fill',
  runsOn: 'client',
  label: 'Fill in the current page',
  description:
    'Set form fields on the screen by their visible label. Use it after page.read so the labels are the ones actually on the page. Reports each field separately, so filling four of five is a useful result rather than a failure.',
  category: 'context',
  inputSchema: z.object({
    fields: z
      .array(
        z.object({
          /** The visible label, as a person would say it. */
          label: z.string().min(1),
          /** Checkboxes take yes or no; dropdowns take one of their choices. */
          value: z.string(),
        }),
      )
      .min(1)
      .max(20),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        filled: z.boolean(),
        reason: z.string().nullable(),
      }),
    ),
    filled: z.number(),
    missed: z.number(),
  }),
  voiceExamples: [
    'Set the project name to Whitfield residence.',
    'Put thirty two in the pool length.',
    'Tick the heater box.',
    'Set the customer name to Jane Whitfield and the address to fourteen Oak Street.',
  ],
  // Client-side, and deliberately through the real controls rather than a store:
  // whatever validation, formatting and save behaviour the form already has then
  // applies unchanged, so a voice-filled field and a typed one are the same field.
  //
  // CLIENT: fillPage(input.fields)
  execute: async () => ({ ok: true, data: { results: [], filled: 0, missed: 0 } }),
})

register({
  id: 'page.click',
  runsOn: 'client',
  label: 'Press a button on the page',
  description:
    'Press a button by its visible text: Save, Create project, Add item, and so on. Use it after page.fill to commit a form — filling fields changes nothing until something saves them. page.read lists the buttons that are actually here.',
  category: 'context',
  inputSchema: z.object({
    label: z.string().min(1),
    /**
     * Required for anything that removes something.
     *
     * Judged on the button's own words rather than a list of ids, because this
     * presses whatever a page renders, including buttons added long after this
     * was written.
     */
    confirm: z.boolean().default(false),
  }),
  outputSchema: z.object({
    label: z.string(),
    clicked: z.boolean(),
    reason: z.string().nullable(),
    available: z.array(z.string()).nullable(),
    needsConfirmation: z.boolean(),
  }),
  voiceExamples: [
    'Save it.',
    'Press create project.',
    'Click add item.',
    'Submit the form.',
  ],
  // CLIENT: clickOnPage(input.label, input.confirm)
  execute: async input => ({
    ok: true,
    data: {
      label: input.label,
      clicked: false,
      reason: null,
      available: null,
      needsConfirmation: false,
    },
  }),
})

/**
 * Commands excluded from `context.recent` because they are the assistant
 * looking around rather than the user doing something: reads, listings and
 * plain navigation. Including them would drown "created a project" under a
 * pile of "read the page" and "went to the dashboard" every time someone asks
 * a question or clicks between screens.
 *
 * `page.read`, `guide.list`, `guide.point`, `guide.clear`, `context.recent`
 * and `scene.describe` are the set named directly in the spec. `nav.goto` and
 * `nav.focus` are the same kind of noise: pure navigation and panel
 * highlighting with no data behind them. The rest are every other read-only
 * `*.describe` / `*.list` command in the registry, on the same reasoning as
 * `scene.describe`: they answer a question, they do not record an action.
 */
const NOISY_AUDIT_COMMAND_IDS = [
  'page.read',
  'guide.list',
  'guide.point',
  'guide.clear',
  'context.recent',
  'scene.describe',
  'nav.goto',
  'nav.focus',
  'project.describe',
  'project.list.describe',
  'pricebook.describe',
  'grade.describe',
  'site.describe',
  'settings.team.describe',
  'capture.coverage.describe',
  'template.scene.list',
  'import.intake.link.list',
] as const

/** Input fields worth surfacing in a recap. Nothing else, so a redacted or
 * credential-bearing row stays opaque rather than leaking a field by accident. */
const NAME_ISH_KEYS = ['name', 'projectId', 'label'] as const

/**
 * Prisma's `cuid()` ids look like `cmf0j3k2x0001abcdefgh`: a lowercase `c`
 * followed by twenty-plus lowercase letters and digits. `projectId` is in
 * NAME_ISH_KEYS because commands that only carry an id (delete, archive,
 * duplicate, status.set) still deserve a recap, but a command that never got
 * to attach a human name renders as "Delete project (cmf0j3k2x0001...)" if
 * the raw id is not screened out first - Marco reads that aloud, and
 * CLAUDE.md forbids putting a cuid in front of a person. A real name or
 * label never matches this shape, so filtering it out costs nothing when
 * one is present.
 */
const CUID_LIKE = /^c[a-z0-9]{20,}$/i

/**
 * Turns one audit row into a sentence a person would say out loud.
 *
 * Pure and synchronous: it only reads the registry (already populated by the
 * time any command runs) and the row's own fields, so it is trivial to call
 * from a test without spinning up a database.
 */
export function describeAuditRow(commandId: string, source: string, inputJson: unknown): string {
  const label = get(commandId)?.label ?? commandId

  let nameish: string | undefined
  if (inputJson && typeof inputJson === 'object' && !Array.isArray(inputJson)) {
    const input = inputJson as Record<string, unknown>
    for (const key of NAME_ISH_KEYS) {
      const value = input[key]
      if (typeof value === 'string' && value.trim().length > 0 && !CUID_LIKE.test(value.trim())) {
        nameish = value
        break
      }
    }
  }

  const described = nameish ? `${label} (${nameish})` : label
  return source === 'UI' ? described : `by ${source.toLowerCase()}: ${described}`
}

register({
  id: 'context.recent',
  label: 'What happened recently',
  description:
    'The most recent actions taken in this organisation, by anyone, through any surface: ' +
    'buttons, keyboard, voice or import. Use it to answer "what did I just do", "what changed", ' +
    'or to pick up where the user left off.',
  category: 'context',
  inputSchema: z.object({ limit: z.number().int().min(1).max(25).optional() }),
  outputSchema: z.object({
    actions: z.array(z.object({ when: z.string(), what: z.string() })),
  }),
  voiceExamples: [
    'What did I just do?',
    'What changed on this project today?',
    'Where did we leave off?',
  ],
  // Server-side, unlike its `page.*` siblings: the audit log lives in the
  // database, not the browser, so there is no client handler to write.
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const { db } = await import('@/lib/db')

    const rows = await db.commandAuditLog.findMany({
      where: {
        orgId: ctx.orgId,
        success: true,
        commandId: { notIn: [...NOISY_AUDIT_COMMAND_IDS] },
      },
      orderBy: { ranAt: 'desc' },
      take: input.limit ?? 10,
      select: { commandId: true, ranAt: true, source: true, inputJson: true },
    })

    return {
      ok: true,
      data: {
        actions: rows.map(row => ({
          when: row.ranAt.toISOString(),
          what: describeAuditRow(row.commandId, row.source, row.inputJson),
        })),
      },
    }
  },
})
