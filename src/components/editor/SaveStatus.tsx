'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { useSaveStatusStore } from '@/modules/editor/state/saveStore'

function formatRelative(ms: number): string {
  const seconds = Math.max(1, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function SaveStatus() {
  const status = useSaveStatusStore((s) => s.status)
  const lastSavedAt = useSaveStatusStore((s) => s.lastSavedAt)
  const [, force] = useState(0)

  useEffect(() => {
    if (status !== 'saved') return
    const id = setInterval(() => force((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [status])

  if (status === 'idle') {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        Save failed
      </span>
    )
  }

  // saved
  const ago = lastSavedAt ? formatRelative(Date.now() - lastSavedAt) : ''
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="h-3.5 w-3.5 text-green-600" />
      Saved{ago ? ` ${ago}` : ''}
    </span>
  )
}
