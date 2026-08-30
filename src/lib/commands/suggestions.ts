// Server-only: imports `@/lib/db` (Prisma) which is Node-only and will not
// bundle into a client component. Call from server components / actions.
import { db } from '@/lib/db'
import { humanFieldName } from '@/lib/human-field'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { ValidationItem } from '@/modules/validation/types'

export interface Suggestion {
  id: string
  label: string
  description?: string
  source: 'validation' | 'hint'
  level?: ValidationItem['level']
  category?: ValidationItem['category']
  innerCommandId?: string
  innerInput?: unknown
}

export interface GetSuggestionsInput {
  projectId: string
}

// Every suggestion names a command and the input to run it with. A suggestion
// without one is a row that closes the palette and changes nothing, which is
// what all five of them used to be: three hints with no command at all, and the
// validation rows with nothing behind them either.
//
// Two hints were removed rather than repaired, because neither could be made to
// work from here:
//   - "Try PebbleTec Cobalt finish" needs a selected pool to apply a finish to,
//     and needs the finish to reach the quote. This runs on the server during
//     the page render, where there is no selection, and the material ids in the
//     inspector are placeholders that pricing does not read. Offering it would
//     promise a re-priced quote that does not happen.
//   - "Add a tanning ledge along the south edge" needs canvas coordinates that
//     only the client has, and the palette's own "Add a tanning ledge" row does
//     the same job from the client where the coordinates are.
const ROTATING_HINTS: Array<Omit<Suggestion, 'source'>> = [
  {
    id: 'hint.run-sun-study',
    label: 'Run a sun study',
    // Was "Run sun study at 4 PM in August / preview afternoon shade at the
    // late-summer sun angle". The command animates sunrise to sunset and takes
    // no date, so the old wording described a feature that does not exist.
    description: 'Moves the sun from sunrise to sunset over this design',
    innerCommandId: 'sun.run.study',
    innerInput: {},
  },
]

/**
 * What the row says underneath its label.
 *
 * The rule's own suggested fix when it has one, because that is already written
 * for a person ("Enter shallow + deep depth in Geometry section"). Otherwise a
 * readable version of where the problem is. It used to print the internal field
 * name in capitals, so a builder read "POOL → DEPTHSHALLOW" and saw leaked code.
 */
function describeItem(item: ValidationItem): string {
  if (item.suggestedFix) return item.suggestedFix
  if (item.field) return `Open the checklist: ${item.category}, ${humanFieldName(item.field)}`
  return `Open the checklist: ${item.category}`
}

/**
 * Drop anything that would not actually run.
 *
 * The last line of defence rather than the first: the rows above are written to
 * be runnable and a test parses each one against its command's schema. This is
 * what keeps a validation item with a surprising shape, or a command that gets
 * renamed, from reaching the palette as a row that does nothing.
 */
export function runnableSuggestions(suggestions: Suggestion[]): Suggestion[] {
  initCommands()
  return suggestions.filter(suggestion => {
    if (!suggestion.innerCommandId) return false
    const command = get(suggestion.innerCommandId)
    if (!command) {
      // A wiring mistake, not a runtime condition: a suggestion naming a
      // command that does not exist is a bug in the suggestion, and it is only
      // actionable while somebody is building one.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[suggestions] ${suggestion.id} names an unregistered command`)
      }
      return false
    }
    const parsed = command.inputSchema.safeParse(suggestion.innerInput ?? {})
    if (!parsed.success) {
      if (process.env.NODE_ENV !== 'production') console.warn(
        `[suggestions] ${suggestion.id} would fail ${suggestion.innerCommandId}: ${parsed.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      )
      return false
    }
    return true
  })
}

export async function getSuggestions(input: GetSuggestionsInput): Promise<Suggestion[]> {
  const validation = await db.validationResult.findFirst({
    where: { projectId: input.projectId },
    orderBy: { runAt: 'desc' },
  })

  const items: ValidationItem[] = Array.isArray(validation?.items)
    ? (validation.items as unknown as ValidationItem[])
    : []

  const validationSuggestions: Suggestion[] = items
    .filter((it) => it.level === 'error' || it.level === 'warn')
    .slice(0, 3)
    .map((it) => ({
      id: `validation.${it.id}`,
      label: it.message,
      description: describeItem(it),
      source: 'validation',
      level: it.level,
      category: it.category,
      // Brings the checklist forward and opens it on this issue, where the
      // wording that says how to fix it lives. Nothing here can fix a design
      // by itself, and a row that claimed to would be the same lie in a new
      // place: showing the person the right panel is a thing it can really do.
      innerCommandId: 'nav.focus',
      innerInput: { target: 'validation' },
    }))

  const remaining = Math.max(5 - validationSuggestions.length, 0)
  const hints: Suggestion[] = ROTATING_HINTS
    .slice(0, remaining)
    .map((h) => ({ ...h, source: 'hint' as const }))

  return runnableSuggestions([...validationSuggestions, ...hints]).slice(0, 5)
}
