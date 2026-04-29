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
  }))

  const grouped = new Map<string, ExistingItem[]>()
  for (const item of items) {
    const list = grouped.get(item.category) ?? []
    list.push(item)
    grouped.set(item.category, list)
  }
  const categories = Array.from(grouped.keys()).sort()

  const bookLabel = book ? `${book.name} v${book.version}` : 'No active book'

  return (
    <div className="container py-8 space-y-6 max-w-5xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Price book</h1>
          <p className="text-sm text-muted-foreground">
            Active: <span className="font-medium">{bookLabel}</span> · {items.length} items
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

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
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
                    <CardTitle className="text-base">{cat}</CardTitle>
                    <span className="text-xs text-muted-foreground">{list.length} items</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Unit</th>
                          <th className="px-3 py-2 font-medium text-right">Cost</th>
                          <th className="px-3 py-2 font-medium text-right">Retail</th>
                          <th className="px-3 py-2 font-medium">Flags</th>
                          <th className="px-3 py-2 font-medium text-right">Actions</th>
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

      <Separator />
      <p className="text-xs text-muted-foreground">Total items: {items.length}</p>
    </div>
  )
}
