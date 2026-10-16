'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Upload } from 'lucide-react'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/modules/editor/stencils/categories'
import { libraryStencilsByCategory, useLibraryStore } from '@/modules/editor/state/libraryStore'
import { VISIO_FILE_ACCEPT } from '@/modules/imports/visio/types'
import { LibraryStencilCard } from './LibraryStencilCard'

interface Props {
  search: string
  onImportFile: (file: File) => void
}

/** The builder's own stencils, above the catalogue. */
export function LibraryGroup({ search, onImportFile }: Props) {
  const stencils = useLibraryStore((s) => s.stencils)
  const loaded = useLibraryStore((s) => s.loaded)
  const error = useLibraryStore((s) => s.error)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!useLibraryStore.getState().loaded) void useLibraryStore.getState().refresh()
  }, [])

  const q = search.trim().toLowerCase()
  const groups = useMemo(() => {
    const list = q
      ? stencils.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      : stencils
    return libraryStencilsByCategory(list)
  }, [stencils, q])

  const shown = [...groups.values()].reduce((n, items) => n + items.length, 0)
  const empty = loaded && stencils.length === 0

  // A search that matches none of the library hides it, so the catalogue's own
  // "no match" line is the only answer.
  if (q && shown === 0) return null

  const chooseFile = () => inputRef.current?.click()

  return (
    <section aria-label="My library" className="pb-1">
      <input
        ref={inputRef}
        type="file"
        accept={VISIO_FILE_ACCEPT}
        className="hidden"
        data-testid="visio-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImportFile(file)
          e.target.value = ''
        }}
      />
      <div className="flex items-center justify-between px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
        <span>
          My library
          {shown > 0 ? <span className="ml-1 text-textFaint">{shown}</span> : null}
        </span>
        {!empty ? (
          <button
            type="button"
            onClick={chooseFile}
            className="flex items-center gap-1 rounded-pfXs px-1 normal-case tracking-normal text-textMuted hover:text-foreground focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent"
          >
            <Upload className="h-3 w-3" aria-hidden />
            Import
          </button>
        ) : null}
      </div>

      {empty ? (
        <div className="mx-2 flex flex-col items-start gap-2 rounded-pfSm border border-dashed border-borderLight px-3 py-3">
          <p className="text-[11px] leading-snug text-textMuted">Drop a Visio stencil (.vss or .vssx) here, or</p>
          <button
            type="button"
            onClick={chooseFile}
            className="flex items-center gap-1.5 rounded-pfSm bg-rowHover px-2 py-1 text-[11px] font-medium text-foreground hover:bg-borderLight focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent"
          >
            <Upload className="h-3 w-3" aria-hidden />
            Choose file
          </button>
          {error !== null ? <p className="text-[10.5px] text-textFaint">{error}</p> : null}
        </div>
      ) : (
        CATEGORY_ORDER.map((cat) => {
          const items = groups.get(cat)
          if (!items || items.length === 0) return null
          return (
            <div key={cat}>
              <div className="px-3 pb-0.5 pt-1.5 text-[10px] text-textFaint">{CATEGORY_LABEL[cat]}</div>
              <div className="grid grid-cols-1 gap-0.5 px-2">
                {items.map((s) => (
                  <LibraryStencilCard key={s.id} stencil={s} />
                ))}
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
