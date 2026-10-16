// The builder's own stencil library, as the panel sees it.
//
// The rows live in `OrgStencil`; this is the client's copy, refreshed through
// `stencil.library.list` and patched after a commit or a delete so the panel
// does not wait on a second round trip to show what just changed.

import type { StencilCategory } from '@prisma/client'
import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { dispatch } from '@/lib/commands/dispatch'
import { CATEGORY_ORDER } from '@/modules/editor/stencils/categories'
import {
  CATALOG_HIDDEN_STORAGE_KEY,
  LibraryCommand,
  type ListOutput,
  type OrgStencilSummary,
} from '@/modules/imports/visio/types'

export interface LibraryState {
  stencils: OrgStencilSummary[]
  loaded: boolean
  loading: boolean
  error: string | null
  /**
   * Whether the built-in Pool Forge catalogue is hidden in the panel. A builder
   * who has imported their own library often wants only that. Per browser, kept
   * in localStorage; it is a viewing preference, not drawing data.
   */
  catalogHidden: boolean
  setCatalogHidden: (hidden: boolean) => void
  /** Dispatches stencil.library.list and replaces `stencils`. */
  refresh: () => Promise<void>
  /** Replace by id or add, after a commit. */
  upsertMany: (stencils: OrgStencilSummary[]) => void
  remove: (id: string) => void
}

function readCatalogHidden(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CATALOG_HIDDEN_STORAGE_KEY) === '1'
  } catch {
    // Private mode or blocked storage: the catalogue simply shows.
    return false
  }
}

function writeCatalogHidden(hidden: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (hidden) window.localStorage.setItem(CATALOG_HIDDEN_STORAGE_KEY, '1')
    else window.localStorage.removeItem(CATALOG_HIDDEN_STORAGE_KEY)
  } catch {
    // Non-fatal: the preference still holds for this page.
  }
}

export const useLibraryStore: UseBoundStore<StoreApi<LibraryState>> = create<LibraryState>((set, get) => ({
  stencils: [],
  loaded: false,
  loading: false,
  error: null,
  catalogHidden: readCatalogHidden(),

  setCatalogHidden: (hidden) => {
    writeCatalogHidden(hidden)
    set({ catalogHidden: hidden })
  },

  refresh: async () => {
    if (get().loading) return
    set({ loading: true })
    const result = await dispatch<Record<string, never>, ListOutput>(LibraryCommand.LIST, {})
    if (result.ok) {
      set({ stencils: result.data.stencils, loaded: true, loading: false, error: null })
    } else {
      // Keep what is on screen: a failed refresh is not an empty library.
      set({ loaded: true, loading: false, error: result.error })
    }
  },

  upsertMany: (incoming) => {
    const byId = new Map(incoming.map((s) => [s.id, s]))
    const next = get().stencils.map((s) => {
      const replacement = byId.get(s.id)
      if (!replacement) return s
      byId.delete(s.id)
      return replacement
    })
    set({ stencils: [...next, ...byId.values()] })
  },

  remove: (id) => set({ stencils: get().stencils.filter((s) => s.id !== id) }),
}))

/** Groups in the panel's category order; empty categories are left out. */
export function libraryStencilsByCategory(
  stencils: OrgStencilSummary[],
): Map<StencilCategory, OrgStencilSummary[]> {
  const groups = new Map<StencilCategory, OrgStencilSummary[]>()
  for (const category of CATEGORY_ORDER) {
    const items = stencils.filter((s) => s.category === category)
    if (items.length > 0) groups.set(category, items)
  }
  return groups
}
