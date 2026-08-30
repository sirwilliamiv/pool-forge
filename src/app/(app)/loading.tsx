import { PageLoading } from '@/components/monitoring/PageLoading'

// The safety net for any route in the app shell without its own loading.tsx:
// route-level ones name what is loading and win when present.
export default function Loading() {
  return <PageLoading />
}
