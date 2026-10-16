// `vss2raw` text in, candidates and skips out. Pure: no DB, no process, no clock.
//
// Contract frozen ahead of the build so the commands and the panel can be
// written against it while the geometry lands. Replaced by the geometry task.

import type { ConversionResult } from './types'

export interface PreviewOptions {
  /** The uploaded file's name, used to bias classification (a master called `Roman` in `Spa.vss` is a spa). */
  fileName: string
}

export function previewFromRaw(_raw: string, _opts: PreviewOptions): ConversionResult {
  throw new Error('previewFromRaw is not implemented yet')
}
