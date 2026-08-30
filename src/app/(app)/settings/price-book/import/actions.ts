'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { dispatchCommand } from '@/modules/commands/dispatch'

/**
 * Load a price list as a new version of the book.
 *
 * It used to append into whichever book was active, so importing a supplier's
 * updated list a second time left every item in there twice. Two of every deck
 * line, and a quote engine that bills each item in a category, is a doubled
 * job on a customer's proposal.
 *
 * A version instead: the incoming list replaces the contents rather than piling
 * on top, and the book it replaced stays readable. An import that turns out to
 * be the wrong file is then a thing you can back out of, which is the whole
 * reason a builder would risk pressing the button at all.
 *
 * The work itself lives in `pricebook.import.replace`, so the bulk replace
 * runs through the registry and leaves an audit row like every other price
 * book edit. This wrapper only turns the session into a command context and
 * revalidates the page the form is on; the shape it hands back is unchanged.
 */
export async function importPriceBookItems(
  rawItems: unknown,
): Promise<{ created: number; version: number; replaced: number }> {
  const session = await auth()
  const userId = session?.user?.id
  const orgId = session?.user?.orgId
  if (!userId || !orgId) throw new Error('Not authenticated')

  const result = await dispatchCommand<{ created: number; version: number; replaced: number }>(
    'pricebook.import.replace',
    { items: rawItems },
    { userId, orgId },
    'IMPORT',
  )
  if (!result.ok) throw new Error(result.error)

  revalidatePath('/settings/price-book')
  return result.data
}
