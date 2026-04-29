import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImportXlsxForm } from '@/components/settings/ImportXlsxForm'

export default async function PriceBookImportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="container py-8 space-y-6 max-w-3xl">
      <div className="text-sm">
        <Link
          href="/settings/price-book"
          className="inline-flex items-center text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to price book
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import price book from Excel</h1>
        <p className="text-sm text-muted-foreground">
          Upload an .xlsx file. The first sheet is read; map columns to fields then import.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload &amp; map</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportXlsxForm />
        </CardContent>
      </Card>
    </div>
  )
}
