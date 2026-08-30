'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { createBookVersionForOrg } from '@/modules/pricing/book'

async function requireOrgId(): Promise<string> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) throw new Error('Not authenticated')
  return orgId
}

/**
 * Session-reading wrapper around `createBookVersionForOrg`, for the "new
 * version" flow, which has no command context of its own.
 */
export async function createBookVersion(): Promise<{ id: string; version: number; copied: number }> {
  const orgId = await requireOrgId()
  const result = await createBookVersionForOrg(orgId)
  revalidatePath('/settings/price-book')
  return result
}
