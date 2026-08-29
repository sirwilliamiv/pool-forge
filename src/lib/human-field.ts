/**
 * A field name a person can read.
 *
 * The validation rules carry the internal key of whatever they checked
 * (`depthShallow`, `equipmentPackage`, `proposalExpiresAt`), and both the
 * checklist and the command palette printed it straight out in capitals. A
 * builder read `POOL · DEPTHSHALLOW` and reasonably concluded that code had
 * leaked onto the screen.
 *
 * Shared rather than duplicated: the palette runs on the server and the
 * checklist in the browser, and the two used to disagree about how much of the
 * internals to show.
 */
export function humanFieldName(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .toLowerCase()
}
