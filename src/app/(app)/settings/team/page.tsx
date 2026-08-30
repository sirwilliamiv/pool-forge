import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { listPendingInvites } from '@/modules/invites/invites'
import { NOT_A_TEAM_KEEPER, canManageTeam } from '@/modules/invites/permissions'
import { listMembers } from '@/modules/invites/team'
import { TeamScreen, type InviteRow, type MemberRow } from './team-screen'

export const metadata = { title: 'Team · Pool Forge' }

// Membership changes the moment somebody uses this screen, so it is never a
// cached render.
export const dynamic = 'force-dynamic'

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')
  const viewerId = session.user.id

  // The viewer's own role in THIS organisation. Read from the membership rather
  // than from the session, because a role can change while a JWT is still valid
  // and the screen that hands out roles is the wrong place to trust a stale one.
  const [membership, org] = await Promise.all([
    db.organizationMember.findFirst({
      where: { orgId, userId: viewerId },
      select: { role: true },
    }),
    db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ])

  if (!membership || !org) redirect('/login')

  if (!canManageTeam(membership.role)) {
    return (
      <div className="container space-y-8 bg-theme-bg py-10 text-theme-fg">
        <Header orgName={org.name} />
        <Card>
          <CardHeader>
            <CardTitle>Not your call</CardTitle>
            <CardDescription>{NOT_A_TEAM_KEEPER}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const [members, invites] = await Promise.all([listMembers(orgId), listPendingInvites(orgId)])

  const memberRows: MemberRow[] = members.map((member) => ({
    userId: member.userId,
    email: member.email,
    name: member.name,
    role: member.role,
    legacyCredential: member.legacyCredential,
    isSelf: member.userId === viewerId,
  }))

  const inviteRows: InviteRow[] = invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: formatDate(invite.expiresAt),
    invitedByEmail: invite.invitedByEmail,
  }))

  return (
    <div className="container space-y-8 bg-theme-bg py-10 text-theme-fg">
      <Header orgName={org.name} />
      <TeamScreen
        members={memberRows}
        invites={inviteRows}
        viewerRole={membership.role}
        orgName={org.name}
      />
    </div>
  )
}

function Header({ orgName }: { orgName: string }) {
  return (
    <SettingsHeader
      title="Team"
      description={
        <span className="font-brandMono text-formLabel uppercase text-theme-faint">{orgName}</span>
      }
    />
  )
}
