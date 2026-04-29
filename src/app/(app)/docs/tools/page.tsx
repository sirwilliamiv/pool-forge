import { TOOLS } from '@/modules/editor/tools'
import { ToolList } from '@/components/docs/ToolList'

export const metadata = { title: 'Tool reference — Pool Forge' }

export default function ToolsDocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tool reference</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every editor tool, its keyboard shortcut, inputs/outputs, and voice-command examples.
          {' '}
          <span className="font-medium">{TOOLS.length}</span> tools registered.
        </p>
      </div>
      <ToolList tools={TOOLS} />
    </div>
  )
}
