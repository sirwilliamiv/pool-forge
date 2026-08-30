import type { EditorCommand, CommandCategory } from '@/modules/commands/registry'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CommandListProps {
  commands: EditorCommand<unknown, unknown>[]
}

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
]

export function CommandList({ commands }: CommandListProps) {
  const grouped = new Map<CommandCategory, EditorCommand<unknown, unknown>[]>()
  for (const c of commands) {
    const arr = grouped.get(c.category) ?? []
    arr.push(c)
    grouped.set(c.category, arr)
  }

  return (
    <div className="space-y-8">
      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
        <section key={cat}>
          <h2 className="font-brandMono text-formLabel uppercase text-theme-muted">
            {cat}{' '}
            <span className="ml-1 text-theme-faint">({grouped.get(cat)?.length ?? 0})</span>
          </h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {(grouped.get(cat) ?? []).map((c) => (
              <CommandCard key={c.id} command={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CommandCard({ command }: { command: EditorCommand<unknown, unknown> }) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-bodyL">{command.label}</CardTitle>
          <span className="rounded-full border border-theme-line px-2 py-0.5 font-brandMono text-formLabel uppercase text-theme-muted">
            {command.category}
          </span>
        </div>
        <code className="block font-brandMono text-bodyS text-theme-muted">{command.id}</code>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-bodyS">
        <p className="text-theme-fg">{command.description}</p>
        {command.voiceExamples && command.voiceExamples.length > 0 ? (
          <div>
            <div className="mb-1 font-brandMono text-formLabel uppercase text-theme-muted">
              Voice
            </div>
            <ul className="space-y-0.5 italic text-theme-muted">
              {command.voiceExamples.map((ex, i) => (
                <li key={i}>“{ex}”</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
