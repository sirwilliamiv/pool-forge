import { initCommands } from '@/modules/commands/init'
import { all } from '@/modules/commands/registry'
import { CommandList } from '@/components/docs/CommandList'

export const metadata = { title: 'Command reference — Pool Forge' }

export default function CommandsDocsPage() {
  initCommands()
  const commands = all()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Command reference</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The unified command registry that the toolbar, hotkeys, and (future) voice agent dispatch
          through. <span className="font-medium">{commands.length}</span> commands registered.
        </p>
      </div>
      <CommandList commands={commands} />
    </div>
  )
}
