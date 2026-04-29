import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function PriceBookSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const items = await db.priceBookItem.findMany({
    where: { priceBook: { orgId } },
    include: { priceBook: { select: { name: true, version: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 500,
  })

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Price book</h1>
        <p className="text-sm text-muted-foreground">Read-only view. Editing comes later.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price book items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium text-right">Cost</th>
                    <th className="px-3 py-2 font-medium text-right">Retail</th>
                    <th className="px-3 py-2 font-medium">Book</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{it.category}</td>
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2">{it.unitType}</td>
                      <td className="px-3 py-2 text-right">${String(it.unitCost)}</td>
                      <td className="px-3 py-2 text-right">${String(it.retailPrice)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {it.priceBook.name} v{it.priceBook.version}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
