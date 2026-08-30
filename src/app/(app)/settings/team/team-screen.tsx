'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  inviteMemberAction,
  removeMemberAction,
  resetMemberPasswordAction,
  revokeInviteAction,
  setMemberRoleAction,
  type TeamActionResult,
} from './actions'

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface MemberRow {
  userId: string
  email: string
  name: string | null
  role: Role
  legacyCredential: boolean
  isSelf: boolean
}

export interface InviteRow {
  id: string
  email: string
  role: Role
  expiresAt: string
  invitedByEmail: string | null
}

export interface TeamScreenProps {
  members: MemberRow[]
  invites: InviteRow[]
  viewerRole: Role
  orgName: string
}

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
}

const ROLE_HELP: Record<Role, string> = {
  OWNER: 'Everything, including managing the team and the price book.',
  ADMIN: 'Manages the team and the price book, but cannot change an owner.',
  MEMBER: 'Draws, quotes and exports. Can ask for price changes.',
}

/** An owner may grant any role; an admin may not hand out more than they hold. */
function grantableRoles(viewerRole: Role): Role[] {
  return viewerRole === 'OWNER' ? ['OWNER', 'ADMIN', 'MEMBER'] : ['ADMIN', 'MEMBER']
}

export function TeamScreen({ members, invites, viewerRole, orgName }: TeamScreenProps) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<TeamActionResult | null>(null)
  const [copied, setCopied] = useState(false)

  function run(work: () => Promise<TeamActionResult>) {
    setResult(null)
    setCopied(false)
    startTransition(async () => {
      setResult(await work())
    })
  }

  const roles = grantableRoles(viewerRole)
  const ownerCount = members.filter((m) => m.role === 'OWNER').length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite somebody</CardTitle>
          <CardDescription>
            Pool Forge is invite only. Send a link and they choose their own password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            action={(form) => run(() => inviteMemberAction(form))}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="off"
                placeholder="them@theircompany.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                name="role"
                defaultValue="MEMBER"
                className="h-11 w-full rounded-brand border-0 bg-theme-field px-3.5 text-bodyL text-theme-fg transition-[background,box-shadow] duration-brand ease-brand hover:bg-[color-mix(in_oklch,var(--theme-fg),transparent_84%)] focus-visible:bg-theme-bg focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--theme-fg)] sm:w-40"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Working…' : 'Send invite'}
            </Button>
          </form>

          <dl className="mt-4 space-y-1.5 text-bodyS">
            {roles.map((role) => (
              <div key={role} className="flex gap-2">
                <dt className="font-brandMono text-formLabel uppercase text-theme-fg">
                  {ROLE_LABEL[role]}
                </dt>
                <dd className="text-theme-muted">{ROLE_HELP[role]}</dd>
              </div>
            ))}
          </dl>

          {result ? (
            <div className="mt-4 space-y-2" data-testid="team-result">
              <p className={result.ok ? 'text-bodyS text-theme-fg' : 'text-bodyS text-brand-red'}>
                {result.ok ? result.message : result.error}
              </p>
              {result.ok && result.link ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={result.link} data-testid="invite-link" className="font-brandMono" />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(result.link ?? '')
                      setCopied(true)
                    }}
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>On the team</CardTitle>
          <CardDescription>
            <span className="font-brandMono text-formLabel uppercase">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>{' '}
            at {orgName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-bodyS" data-testid="member-table">
            <thead>
              <tr className="border-b border-theme-line text-left font-brandMono text-formLabel uppercase text-theme-muted">
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const lastOwner = member.role === 'OWNER' && ownerCount <= 1
                const untouchable =
                  member.isSelf || (viewerRole === 'ADMIN' && member.role !== 'MEMBER')
                return (
                  <tr
                    key={member.userId}
                    className="border-b border-theme-line last:border-0"
                    data-testid="member-row"
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium text-theme-fg">{member.name ?? member.email}</div>
                      <div className="font-brandMono text-formLabel text-theme-muted">
                        {member.email}
                      </div>
                      {member.legacyCredential ? (
                        <div className="mt-0.5 text-bodyS text-theme-muted">
                          Signs in with an older password. It moves across the next time they sign
                          in.
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        disabled={pending || untouchable || lastOwner}
                        onChange={(event) =>
                          run(() => setMemberRoleAction(member.userId, event.target.value))
                        }
                        className="h-9 rounded-brand border-0 bg-theme-field px-2 font-brandMono text-formLabel uppercase text-theme-fg transition-[background,box-shadow] duration-brand ease-brand hover:bg-[color-mix(in_oklch,var(--theme-fg),transparent_84%)] focus-visible:bg-theme-bg focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--theme-fg)] disabled:opacity-45"
                      >
                        {[...new Set([...roles, member.role])].map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                      {lastOwner ? (
                        <p className="mt-1 text-bodyS text-theme-muted">
                          The only owner. Make somebody else an owner first.
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <div className="flex justify-end gap-2">
                        {member.isSelf ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending || untouchable}
                            onClick={() => run(() => resetMemberPasswordAction(member.userId))}
                          >
                            Password link
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending || untouchable || lastOwner}
                          onClick={() => run(() => removeMemberAction(member.userId))}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waiting to join</CardTitle>
          <CardDescription>
            {invites.length === 0
              ? 'No invites are outstanding.'
              : 'These links work once and then stop.'}
          </CardDescription>
        </CardHeader>
        {invites.length > 0 ? (
          <CardContent className="overflow-x-auto">
            <table className="w-full text-bodyS" data-testid="invite-table">
              <thead>
                <tr className="border-b border-theme-line text-left font-brandMono text-formLabel uppercase text-theme-muted">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Expires</th>
                  <th className="py-2 pr-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr
                    key={invite.id}
                    className="border-b border-theme-line last:border-0"
                    data-testid="invite-row"
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium text-theme-fg">{invite.email}</div>
                      {invite.invitedByEmail ? (
                        <div className="font-brandMono text-formLabel text-theme-muted">
                          Invited by {invite.invitedByEmail}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 font-brandMono text-formLabel uppercase text-theme-fg">
                      {ROLE_LABEL[invite.role]}
                    </td>
                    <td className="py-3 pr-4 font-brandMono text-formLabel text-theme-muted">
                      {invite.expiresAt}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => revokeInviteAction(invite.id))}
                      >
                        Cancel invite
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        ) : null}
      </Card>
    </div>
  )
}
