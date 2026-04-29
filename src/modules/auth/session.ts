import { redirect } from 'next/navigation'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'

export async function getSession(): Promise<Session | null> {
  return auth()
}

export async function requireSession(): Promise<Session> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  return session
}

export function getOrgId(session: Session): string | null {
  return session.user.orgId ?? null
}

export async function requireOrgId(): Promise<{ session: Session; orgId: string }> {
  const session = await requireSession()
  const orgId = getOrgId(session)
  if (!orgId) redirect('/login')
  return { session, orgId }
}

export type OrgScopedHandler<TArgs extends unknown[], TResult> = (
  ctx: { session: Session; orgId: string },
  ...args: TArgs
) => Promise<TResult>

export function withOrg<TArgs extends unknown[], TResult>(
  handler: OrgScopedHandler<TArgs, TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const ctx = await requireOrgId()
    return handler(ctx, ...args)
  }
}
