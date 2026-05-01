'use client'

import { Html } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onSave: (text: string) => void
  onCancel: () => void
}

// Mounted from ToolGestures inside <Canvas>; portals a small DOM dialog
// to the screen via drei <Html>. Auto-focuses the input; Enter saves, Esc cancels.
export function AnnotationDialog({ onSave, onCancel }: Props) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function commit() {
    const trimmed = text.trim()
    if (!trimmed) {
      onCancel()
      return
    }
    onSave(trimmed)
  }

  return (
    <Html fullscreen zIndexRange={[100, 0]}>
      <div
        className="pointer-events-auto fixed inset-0 grid place-items-center bg-black/30"
        onClick={onCancel}
      >
        <div
          className="w-[320px] rounded-pfMd bg-white p-3 shadow-pfLg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-textMuted">
            Annotation
          </div>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
            }}
            placeholder="Note text…"
            className="mt-2 h-8 w-full rounded-pfSm border border-borderLight px-2 text-[12px] focus:border-pfAccent focus:outline-none focus:ring-1 focus:ring-pfAccent"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-7 rounded-pfSm px-3 text-[11.5px] text-textMuted hover:bg-rowHover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="h-7 rounded-pfSm bg-pfAccent px-3 text-[11.5px] font-medium text-white hover:bg-pfAccentStrong"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Html>
  )
}
