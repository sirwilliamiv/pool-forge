import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  CompanySettingsForm,
  type CompanySettingsInput,
} from '@/components/settings/CompanySettingsForm'

async function saveCompanyAction(input: CompanySettingsInput) {
  'use server'
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!session || !orgId) return { ok: false, error: 'Not authenticated' }

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Company name is required' }

  const brandColor = input.brandColor.trim()
  if (brandColor && !/^#[0-9a-fA-F]{3,8}$/.test(brandColor)) {
    return { ok: false, error: 'Brand color must be a hex value like #0284c7' }
  }

  const logoUrl = input.logoUrl.trim()
  if (logoUrl && !/^(https?:\/\/|data:image\/)/.test(logoUrl)) {
    return { ok: false, error: 'Logo must be an https link or a data:image URL' }
  }

  const taxRatePct = Number.isFinite(input.taxRatePct)
    ? Math.min(Math.max(input.taxRatePct, 0), 100)
    : 0

  await db.organization.update({
    where: { id: orgId },
    data: {
      name,
      logoUrl: logoUrl || null,
      brandColor: brandColor || null,
      taxRatePct,
    },
  })
  return { ok: true }
}

export default async function CompanySettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { name: true, logoUrl: true, brandColor: true, taxRatePct: true },
  })
  if (!org) redirect('/login')

  const initial: CompanySettingsInput = {
    name: org.name,
    logoUrl: org.logoUrl ?? '',
    brandColor: org.brandColor ?? '',
    taxRatePct: org.taxRatePct,
  }

  return (
    <div className="container space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company settings</h1>
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Back to projects
          </Link>
        </p>
      </div>
      <CompanySettingsForm initial={initial} saveAction={saveCompanyAction} />
    </div>
  )
}
