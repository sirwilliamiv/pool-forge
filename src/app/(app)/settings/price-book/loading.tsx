import { PageLoading } from '@/components/monitoring/PageLoading'

// One route wired up, as the worked example. The price book is the slowest page
// in the product — it reads a whole book of line items — so it is the one where
// a loading state actually earns its place rather than flashing.
//
// Rolling this out is one file like this per route, with `what` set to the
// thing that route loads.
export default function Loading() {
  return <PageLoading what="the price book" rows={5} />
}
