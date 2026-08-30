import { PageLoading } from '@/components/monitoring/PageLoading'

// Streamed while this route's data is on the way. `what` names the thing being
// loaded rather than saying "Loading", so the wait is attached to an object.
export default function Loading() {
  return <PageLoading what="the import" />
}
