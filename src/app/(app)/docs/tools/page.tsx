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
    <div className="space-y-12">
      <div>
        <h1 className="text-title2 font-medium text-theme-fg">Tool reference</h1>
        <p className="mt-2 text-bodyL text-theme-muted">
          <span className="font-brandMono text-bodyS text-theme-fg">{built.length}</span> tools
          you can use today, and{' '}
          <span className="font-brandMono text-bodyS text-theme-fg">{planned.length}</span>{' '}
          designed but not built.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-title4 font-medium text-theme-fg">In the editor now</h2>
        <ToolList tools={built} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-title4 font-medium text-theme-fg">Designed, not built</h2>
          <p className="mt-1 text-bodyS text-theme-muted">
            These have no button and no shortcut. Some of what they describe is reachable another
            way, through a command or the voice assistant.
          </p>
        </div>
        <ToolList tools={planned} />
      </section>
    </div>
  )
}
