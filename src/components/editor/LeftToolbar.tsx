'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useEditorStore } from '@/modules/editor/state'
import { toolsByCategory } from '@/modules/editor/tools'
import { cn } from '@/lib/utils'

// TODO(Track E): wrap each button in <Tooltip> for hover labels once the
// tooltip primitive lands at @/components/ui/tooltip.
export function LeftToolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)

  const groups = toolsByCategory()
  const visibleGroups: Array<keyof typeof groups> = ['selection', 'drawing', 'transform']

  return (
    <aside className="flex w-12 flex-col items-center gap-1 border-r bg-background py-2">
      {visibleGroups.map((group, idx) => (
        <div key={group} className="flex w-full flex-col items-center gap-1">
          {idx > 0 && <Separator className="my-1" />}
          {groups[group].map((tool) => (
            <Button
              key={tool.id}
              variant="ghost"
              size="icon"
              title={`${tool.tooltip}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
              aria-label={tool.name}
              className={cn('h-9 w-9', activeTool === tool.id && 'bg-accent text-accent-foreground')}
              onClick={() => setActiveTool(tool.id)}
            >
              <span className="text-[10px] font-medium">{tool.name.slice(0, 2)}</span>
            </Button>
          ))}
        </div>
      ))}
    </aside>
  )
}
