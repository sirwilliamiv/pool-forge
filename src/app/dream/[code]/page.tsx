// Somebody else's backyard, opened from a link.
//
// The code carries the whole design, so this page looks nothing up: it decodes,
// renders, and the visitor lands on the pool their partner built rather than on
// a default one. `decodeDream` never throws and never returns null, so a
// mangled or truncated code opens the pool it can still read instead of a 404.
// A link that arrived in a text message is not the reader's fault.

import type { Metadata } from 'next'

import { DreamStudio } from '@/components/dream/DreamStudio'
import { priceDream } from '@/modules/dream/pricing'
import { decodeDream } from '@/modules/dream/share'
import { sizeById } from '@/modules/dream/catalog'

interface PageProps {
  params: Promise<{ code: string }>
}

/**
 * The card that shows up when the link is pasted anywhere.
 *
 * It names the pool and the range, because the share that actually happens is
 * one person sending this to another and the preview is most of that message.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const config = decodeDream(code)
  const ballpark = priceDream(config)
  const size = sizeById(config.size)
  const money = (value: number) => `$${Math.round(value / 1000)}k`

  const title = `A ${size.lengthFt}' x ${size.widthFt}' pool, ${money(ballpark.low)} to ${money(ballpark.high)}`
  const description =
    'Built in the Pool Forge dream sheet. A ballpark, not a quote. Change anything and the price moves.'

  return {
    title: `${title} · Pool Forge`,
    description,
    openGraph: { title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function SharedDreamPage({ params }: PageProps) {
  const { code } = await params
  return <DreamStudio initial={decodeDream(code)} />
}
