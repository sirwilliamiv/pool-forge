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
    <div className="container max-w-3xl space-y-6 py-8 text-theme-fg">
      <div className="text-bodyS">
        <Link
          href="/settings/price-book"
          className="inline-flex items-center text-theme-muted transition-[color] duration-brand ease-brand hover:text-theme-fg"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to price book
        </Link>
      </div>

      <div>
        <h1 className="text-title3 font-display">Import price book from Excel</h1>
        <p className="text-bodyS text-theme-muted">
          Upload an .xlsx file. The first sheet is read; map columns to fields then import.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-bodyL font-medium">Upload &amp; map</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportXlsxForm />
        </CardContent>
      </Card>
    </div>
  )
}
