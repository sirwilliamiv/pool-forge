import { TOOLS } from '@/modules/editor/tools'
import { ToolList } from '@/components/docs/ToolList'

export const metadata = { title: 'Tool reference — Pool Forge' }

export default function ToolsDocsPage() {
  // Built and planned are shown apart, because this page used to list them
  // together: 48 tools nobody could use, alongside 3 that worked, with 9 real
  // ones missing entirely. A reference that cannot be trusted is worse than no
  // reference, since somebody acts on it.
  const built = TOOLS.filter(tool => tool.status === 'built')
  const planned = TOOLS.filter(tool => tool.status !== 'built')

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tool reference</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium">{built.length}</span> tools you can use today, and{' '}
          <span className="font-medium">{planned.length}</span> designed but not built.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">In the editor now</h2>
        <ToolList tools={built} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Designed, not built</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These have no button and no shortcut. Some of what they describe is reachable another
            way, through a command or the voice assistant.
          </p>
        </div>
        <ToolList tools={planned} />
      </section>
    </div>
  )
}
