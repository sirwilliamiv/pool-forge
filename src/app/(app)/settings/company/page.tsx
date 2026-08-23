import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { CompanySettingsForm } from '@/components/settings/CompanySettingsForm'
import {
  parsePaymentSchedule,
  type CompanySettingsInput,
} from '@/modules/organization/company'

// The save goes through `settings.company.update` in the command registry, not
// through a server action writing Prisma directly. That is what puts a row in
// `CommandAuditLog` when somebody changes the licence number that prints on a
// contract.

export default async function CompanySettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      logoUrl: true,
      brandColor: true,
      taxRatePct: true,
      address: true,
      phone: true,
      email: true,
      licenseNumber: true,
      proposalTerms: true,
      proposalValidDays: true,
      paymentSchedule: true,
    },
  })
  if (!org) redirect('/login')

  const initial: CompanySettingsInput = {
    name: org.name,
    logoUrl: org.logoUrl ?? '',
    brandColor: org.brandColor ?? '',
    taxRatePct: org.taxRatePct,
    address: org.address ?? '',
    phone: org.phone ?? '',
    email: org.email ?? '',
    licenseNumber: org.licenseNumber ?? '',
    proposalTerms: org.proposalTerms ?? '',
    proposalValidDays: org.proposalValidDays,
    paymentSchedule: parsePaymentSchedule(org.paymentSchedule),
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
      <CompanySettingsForm initial={initial} />
    </div>
  )
}
