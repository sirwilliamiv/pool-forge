'use client'

import { useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useFileDrop } from '@/components/imports/ImportEmptyState'
import { dispatch } from '@/lib/commands/dispatch'
import { STENCILS, type Stencil } from '@/modules/editor/stencils'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/modules/editor/stencils/categories'
import type { StencilCategory } from '@/modules/editor/stencils/types'
import { useLibraryStore } from '@/modules/editor/state/libraryStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { stagedCount, stagingPlacement } from '@/modules/editor/placement'
import {
  CatalogCopy,
  LibraryCommand,
  type CatalogToggleInput,
  type CatalogToggleOutput,
  type OrgStencilSummary,
  type PreviewOutput,
} from '@/modules/imports/visio/types'
import { LibraryGroup } from './LibraryGroup'
import { StencilCard } from './StencilCard'
import { VisioImportDialog } from './VisioImportDialog'
import { uploadStencilFile } from './visio-upload'

interface Props {
  search: string
}

export function StencilGrid({ search }: Props) {
  const [preview, setPreview] = useState<PreviewOutput | null>(null)
  const [uploading, setUploading] = useState(false)
  const catalogHidden = useLibraryStore((st) => st.catalogHidden)
  const libraryMatches = useLibraryStore((st) => {
    const q = search.trim().toLowerCase()
    return st.stencils.some((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
  })

  const importFile = async (file: File) => {
    setUploading(true)
    const pending = toast.loading(`Reading ${file.name}`)
    const result = await uploadStencilFile(file)
    toast.dismiss(pending)
    setUploading(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setPreview(result.data)
  }

  // The whole panel takes a dropped stencil file, not only the library's empty
  // zone: aiming at a small box is a needless miss. It reacts to `Files` alone,
  // so a stencil card dragged across it on the way to the canvas lights nothing.
  const { dragging, dropProps } = useFileDrop((files) => {
    const file = files[0]
    if (file) void importFile(file)
  }, uploading)

  const onImported = (stencils: OrgStencilSummary[]) => {
    useLibraryStore.getState().upsertMany(stencils)
    setPreview(null)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? STENCILS.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q),
        )
      : STENCILS

    const groups = new Map<StencilCategory, Stencil[]>()
    for (const s of list) {
      const arr = groups.get(s.category) ?? []
      arr.push(s)
      groups.set(s.category, arr)
    }
    return groups
  }, [search])

  const catalogCount = useMemo(
    () => [...filtered.values()].reduce((n, items) => n + items.length, 0),
    [filtered],
  )

  const toggleCatalog = () =>
    void dispatch<CatalogToggleInput, CatalogToggleOutput>(LibraryCommand.CATALOG_TOGGLE, {
      hidden: !catalogHidden,
    })

  const onAdd = (stencil: Stencil) => {
    // Staged in a block beside whatever is already drawn, rather than queued in
    // a line. The old rule anchored to RECTANGLE_POOL alone, so a Grecian or a
    // pool-and-spa stranded everything at the origin, and its fixed stagger ran
    // thirty-six objects about ninety-six feet down the sheet.
    const shapes = useShapesStore.getState().shapes
    const { x, y } = stagingPlacement(shapes, stencil.id, stagedCount(shapes))
    void dispatch('add.shape', { stencilId: stencil.id, x, y })
  }

  return (
    <div
      data-accent="azure"
      data-testid="stencil-drop-zone"
      data-dragging={dragging ? 'true' : 'false'}
      {...dropProps}
      className={
        'relative min-h-full pb-3 transition duration-brand ease-brand ' +
        (dragging ? 'bg-family-tint/40 ring-2 ring-inset ring-family-accent' : '')
      }
    >
      <LibraryGroup search={search} onImportFile={(file) => void importFile(file)} />
      {(catalogHidden || filtered.size === 0) && !libraryMatches && search.trim() ? (
        <p className="px-3 py-3 text-[11.5px] text-textFaint">
          No stencils match “{search}”.
        </p>
      ) : null}
      {/* The built-in catalogue under its own heading, so a builder who has
          imported their own library can put ours away and see only theirs.
          The preference goes through the registry like every other toggle. */}
      <section aria-label={CatalogCopy.HEADING}>
        <div className="flex items-center justify-between px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
          <span>
            {CatalogCopy.HEADING}
            {!catalogHidden ? <span className="ml-1 text-textFaint">{catalogCount}</span> : null}
          </span>
          <button
            type="button"
            onClick={toggleCatalog}
            aria-pressed={catalogHidden}
            aria-label={catalogHidden ? CatalogCopy.SHOW_LABEL : CatalogCopy.HIDE_LABEL}
            data-testid="catalog-toggle"
            className="flex items-center gap-1 rounded-pfXs px-1 normal-case tracking-normal text-textMuted hover:text-foreground focus:outline-none focus:ring-[1.5px] focus:ring-pfAccent"
          >
            {catalogHidden ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
            {catalogHidden ? CatalogCopy.SHOW : CatalogCopy.HIDE}
          </button>
        </div>
        {catalogHidden ? (
          <p className="px-3 pb-2 text-[10.5px] text-textFaint">{CatalogCopy.HIDDEN_NOTE}</p>
        ) : null}
      </section>
      {catalogHidden ? null : CATEGORY_ORDER.map((cat) => {
        const items = filtered.get(cat)
        if (!items || items.length === 0) return null
        return (
          <section key={cat}>
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] text-textFaint">
              {CATEGORY_LABEL[cat]}
              <span className="ml-1">{items.length}</span>
            </div>
            {/* One column. Three columns is what forced every name into an
                ellipsis, and the names are the only thing that tells two of
                these shapes apart. */}
            <div className="grid grid-cols-1 gap-0.5 px-2">
              {items.map((s) => (
                <StencilCard key={s.id} stencil={s} onAdd={onAdd} />
              ))}
            </div>
          </section>
        )
      })}
      {preview ? (
        <VisioImportDialog preview={preview} onClose={() => setPreview(null)} onImported={onImported} />
      ) : null}
    </div>
  )
}
