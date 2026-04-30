// Server-only: imports `@/lib/db` (Prisma) which is Node-only and will not
// bundle into a client component. Call from server components / actions.
import { db } from '@/lib/db'
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
  selection?: string[]
  nowMinutes?: number
}

const ROTATING_HINTS: Array<Omit<Suggestion, 'source'>> = [
  {
    id: 'hint.pebbletec-cobalt',
    label: 'Try PebbleTec Cobalt finish',
    description: 'Switch the interior finish to PebbleTec Cobalt and recompute the quote.',
  },
  {
    id: 'hint.run-sun-study-4pm-aug',
    label: 'Run sun study at 4 PM in August',
    description: 'Preview afternoon shade at the late-summer sun angle.',
    innerCommandId: 'sun.run.study',
    innerInput: {},
  },
  {
    id: 'hint.add-tanning-ledge-south',
    label: 'Add a tanning ledge along the south edge',
    description: 'Adds a new sun shelf with default dimensions on the south side.',
  },
]

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
      description: it.field ? `${it.category} → ${it.field}` : it.category,
      source: 'validation',
      level: it.level,
      category: it.category,
    }))

  const remaining = Math.max(5 - validationSuggestions.length, 0)
  const hasSelection = (input.selection?.length ?? 0) > 0
  const hints: Suggestion[] = ROTATING_HINTS
    .filter((h) => hasSelection || h.id !== 'hint.add-tanning-ledge-south')
    .slice(0, remaining)
    .map((h) => ({ ...h, source: 'hint' as const }))

  return [...validationSuggestions, ...hints].slice(0, 5)
}
