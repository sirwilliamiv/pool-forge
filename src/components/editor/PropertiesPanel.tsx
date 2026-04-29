'use client'

import { useSelectionStore } from '@/modules/editor/state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// TODO(Track E): use <Tabs> for "Properties" / "Style" / "Layer" when the tabs primitive lands.
export function PropertiesPanel() {
  const selectedIds = useSelectionStore((s) => s.selectedIds)

  return (
    <aside className="flex w-72 flex-col overflow-y-auto border-l bg-background">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Properties
      </div>
      <div className="flex-1 p-3">
        {selectedIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No selection.</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <p className="text-muted-foreground">{selectedIds.length} object(s)</p>
              <ul className="space-y-0.5 font-mono">
                {selectedIds.map((id) => (
                  <li key={id} className="truncate">
                    {id}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </aside>
  )
}
