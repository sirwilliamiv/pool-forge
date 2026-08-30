import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Upload } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AddItemButton } from '@/components/settings/AddItemButton'
import { PriceBookItemRow } from '@/components/settings/PriceBookItemRow'
import type { ExistingItem } from '@/components/settings/PriceBookItemDialog'
import { PriceBookCoverage } from '@/components/settings/PriceBookCoverage'
import { categoryLabel, normalizeOptionKey } from '@/modules/pricing/engine'
import { priceBookCoverage } from '@/modules/onboarding/coverage'
import {
  PLACEHOLDER_PRICE_NOTICE,
  unchangedStarterLines,
} from '@/modules/onboarding/starter-price-book'
import { PriceCategory } from '@prisma/client'

/**
 * Categories no drawing measures, and what to do about them.
 *
 * These five used to accept a price, list it here, and never put it on a quote.
 * The price is still worth keeping — it is the builder's rate — but the
 * quantity belongs to one job, so it is added there. Said on the screen where
 * the item is entered, because that is where somebody forms the belief that
 * entering it was enough.
 */
const PER_JOB_CATEGORIES: ReadonlySet<string> = new Set([
  PriceCategory.LANAI,
  PriceCategory.FENCE,
  PriceCategory.WALL,
  PriceCategory.ELECTRICAL,
  PriceCategory.MISC,
])

export default async function PriceBookSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const book = await db.priceBook.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: 'desc' },
    include: {
      items: {
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      },
    },
  })

  const items: ExistingItem[] = (book?.items ?? []).map((it) => ({
    id: it.id,
    category: it.category,
    name: it.name,
    unitType: it.unitType,
    retailPrice: Number(it.retailPrice),
    unitCost: Number(it.unitCost),
    customerVisible: it.customerVisible,
    internalOnly: it.internalOnly,
    required: it.required,
    upgradeOnly: it.upgradeOnly,
    optionKey: normalizeOptionKey(it.optionKey),
  }))

  const grouped = new Map<string, ExistingItem[]>()
  for (const item of items) {
    const list = grouped.get(item.category) ?? []
    list.push(item)
    grouped.set(item.category, list)
  }
  const categories = Array.from(grouped.keys()).sort()

  const bookLabel = book ? `${book.name} v${book.version}` : 'No active book'

  // Coverage is computed from the same stencil mapping the quote engine reads,
  // so what this panel calls a hole is exactly what a quote would refuse to
  // price. The placeholder count falls as the builder replaces our numbers.
  const coverage = priceBookCoverage(items)
  const placeholderCount = unchangedStarterLines(items).length

  return (
    <div className="container max-w-5xl space-y-6 py-8 text-theme-fg">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-title3 font-display">Price book</h1>
          <p className="text-bodyS text-theme-muted">
            Active:{' '}
            <span className="font-brandMono tracking-[0.5px] text-theme-fg">{bookLabel}</span> ·{' '}
            <span className="font-brandMono tracking-[0.5px]">{items.length}</span> items
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/price-book/import">
              <Upload className="mr-1 h-4 w-4" />
              Import XLSX
            </Link>
          </Button>
          <AddItemButton />
        </div>
      </div>

      <PriceBookCoverage
        rows={coverage}
        placeholderCount={placeholderCount}
        placeholderNotice={PLACEHOLDER_PRICE_NOTICE}
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-theme-muted">
            <p className="mb-4">No items yet.</p>
            <AddItemButton />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => {
            const list = grouped.get(cat) ?? []
            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <div className="flex items-baseline justify-between">
                    <CardTitle className="font-brandMono text-bodyS uppercase tracking-[0.6px] text-theme-fg">
                      {cat}
                    </CardTitle>
                    <span className="font-brandMono text-formLabel tracking-[0.5px] text-theme-muted">
                      {list.length} items
                    </span>
                  </div>
                  {PER_JOB_CATEGORIES.has(cat) ? (
                    <p className="pt-1 text-bodyS text-brand-orange">
                      Nothing in a drawing measures{' '}
                      {categoryLabel(cat as PriceCategory).toLowerCase()}, so these are not billed
                      automatically. Open a project and add one under “Added to this job” to put it
                      on that quote.
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-bodyS">
                      <thead className="border-b border-theme-line text-left font-brandMono text-formLabel uppercase tracking-[0.6px] text-theme-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Unit</th>
                          <th className="px-3 py-2 text-right font-medium">Cost</th>
                          <th className="px-3 py-2 text-right font-medium">Retail</th>
                          <th className="px-3 py-2 font-medium">Flags</th>
                          <th className="px-3 py-2 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((item) => (
                          <PriceBookItemRow key={item.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Separator className="bg-theme-line" />
      <p className="text-bodyS text-theme-muted">
        Total items: <span className="font-brandMono tracking-[0.5px]">{items.length}</span>
      </p>
    </div>
  )
}
