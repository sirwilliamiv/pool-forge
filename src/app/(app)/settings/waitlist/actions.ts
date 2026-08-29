'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { setWaitlistInvited } from '@/modules/waitlist/admin'
import { isWaitlistOperator } from '@/modules/waitlist/operators'

const markInvitedSchema = z.object({
  id: z.string().min(1).max(64),
  invited: z.enum(['true', 'false']),
})

/**
 * Mark somebody as invited, or take the mark back.
 *
 * The operator check is repeated here and is not a duplicate of the page's. A
 * server action is an endpoint with its own URL: anybody who has ever loaded a
 * page containing this form can post to it afterwards, from anywhere, and the
 * page component that gated the render is not in that request's path.
 *
 * Deliberately not routed through the command registry, unlike the rest of the
 * app's writes. `CommandContext` requires an `orgId`, and a waitlist row
 * belongs to no organisation by definition; registering it would also publish
 * the owner's prospect pipeline into `/docs/commands` and the voice surface,
 * which every beta customer can see.
 */
export async function markInvitedAction(formData: FormData): Promise<void> {
  const session = await auth()
  if (!isWaitlistOperator(session?.user?.email)) return

  const parsed = markInvitedSchema.safeParse({
    id: formData.get('id') ?? '',
    invited: formData.get('invited') ?? '',
  })
  if (!parsed.success) return

  await setWaitlistInvited(parsed.data.id, parsed.data.invited === 'true')
  revalidatePath('/settings/waitlist')
}
