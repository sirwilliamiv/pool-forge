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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {cat}{' '}
            <span className="ml-1 font-normal text-muted-foreground/70">
              ({grouped.get(cat)?.length ?? 0})
            </span>
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
          <CardTitle className="text-base">{command.label}</CardTitle>
          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {command.category}
          </span>
        </div>
        <code className="block font-mono text-xs text-muted-foreground">{command.id}</code>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-xs">
        <p className="text-foreground/80">{command.description}</p>
        {command.voiceExamples && command.voiceExamples.length > 0 ? (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Voice
            </div>
            <ul className="space-y-0.5 italic text-muted-foreground">
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
