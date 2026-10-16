// Decides by magic bytes, never by extension or declared type, whether a file
// is a Visio stencil container worth handing to the converter. A PNG renamed
// `.vss` is refused here rather than reaching a child process.

import { VisioContainer } from './types'

/** OLE2 compound document header: Visio 2003 to 2010 (`.vss`). */
export const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/** Zip local file header: Visio 2013 and later (`.vssx`). */
export const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])

const MIN_SNIFF_BYTES = OLE2_SIGNATURE.length

export function sniffVisio(bytes: Buffer): VisioContainer | null {
  if (bytes.length < MIN_SNIFF_BYTES) return null
  if (bytes.subarray(0, OLE2_SIGNATURE.length).equals(OLE2_SIGNATURE)) return VisioContainer.OLE2
  if (bytes.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)) return VisioContainer.ZIP
  return null
}
