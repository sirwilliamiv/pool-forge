import Link from 'next/link'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RESET_REFUSAL } from '@/modules/invites/invites'
import { previewPasswordReset } from '@/modules/auth/password-reset'
import { ResetPasswordForm } from './reset-form'

export const metadata = { title: 'Set a new password · Pool Forge' }

// Reading the link does not spend it. A mail client that prefetches, or somebody
// who opens the message and then goes to make coffee, must not burn the one use
// before a password has been typed.
export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const decoded = decodeURIComponent(token)
  const preview = await previewPasswordReset(decoded)

  if (!preview.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This link cannot be used</CardTitle>
          <CardDescription>{RESET_REFUSAL[preview.refusal]}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-bodyS text-theme-muted">
            <Link href="/forgot-password" className="underline underline-offset-4 hover:text-theme-fg">
              Ask for a new link
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  return <ResetPasswordForm token={decoded} email={preview.preview.email} />
}
