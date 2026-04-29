import type { Tool } from '@/modules/editor/tools'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface ToolListProps {
  tools: Tool[]
}

const CATEGORY_ORDER: Tool['category'][] = [
  'selection',
  'drawing',
  'transform',
  'measurement',
  'pricing',
  'export',
]

export function ToolList({ tools }: ToolListProps) {
  const grouped = new Map<Tool['category'], Tool[]>()
  for (const t of tools) {
    const arr = grouped.get(t.category) ?? []
    arr.push(t)
    grouped.set(t.category, arr)
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
            {(grouped.get(cat) ?? []).map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{tool.name}</CardTitle>
          {tool.shortcut ? (
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] uppercase text-muted-foreground">
              {tool.shortcut}
            </kbd>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">{tool.tooltip}</div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-xs">
        <p className="text-foreground/80">{tool.description}</p>
        <Separator />
        <FieldGrid
          rows={[
            ['Icon', tool.icon],
            ['Inputs', joinList(tool.inputs)],
            ['Outputs', joinList(tool.outputs)],
            ['Side effects', joinList(tool.sideEffects)],
            ['Errors', joinList(tool.errorStates)],
            ['Undo', tool.undoBehavior],
          ]}
        />
        {tool.voiceCommandExamples.length > 0 ? (
          <>
            <Separator />
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Voice
              </div>
              <ul className="space-y-0.5 text-xs italic text-muted-foreground">
                {tool.voiceCommandExamples.map((ex, i) => (
                  <li key={i}>“{ex}”</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function joinList(arr: string[]): string {
  return arr.length === 0 ? '—' : arr.join(', ')
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {k}
          </dt>
          <dd className="break-words text-foreground/80">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
