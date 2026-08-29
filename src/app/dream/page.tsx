// The studio, opened fresh.
//
// A server component that renders one client component and nothing else. The
// whole page is derived from a config that lives in the browser, so there is
// nothing for the server to fetch and nothing to wait for: the first thing a
// visitor sees is a priced pool.

import { DEFAULT_DREAM } from '@/modules/dream/config'
import { DreamStudio } from '@/components/dream/DreamStudio'

export default function DreamPage() {
  return <DreamStudio initial={DEFAULT_DREAM} />
}
