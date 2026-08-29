import Link from 'next/link'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { previewInvite } from '@/modules/invites/invites'
import { InviteForm } from './invite-form'

export const metadata = { title: 'Join a team · Pool Forge' }

// Rendering this page reads the invite but does NOT spend it. A mail client that
// prefetches links, a security scanner, or somebody who opens the message twice
// must not burn the one use before the person has typed anything.
//
// The page is dynamic by necessity: the token is in the path and the answer
// depends on a database row that changes.
export const dynamic = 'force-dynamic'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const preview = await previewInvite(decodeURIComponent(token))

  if (!preview.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This link cannot be used</CardTitle>
          <CardDescription>{preview.error}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="underline underline-offset-4">
              Go to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <InviteForm
      token={decodeURIComponent(token)}
      email={preview.preview.email}
      orgName={preview.preview.orgName}
      role={preview.preview.role}
      hasAccount={preview.preview.hasAccount}
    />
  )
}
