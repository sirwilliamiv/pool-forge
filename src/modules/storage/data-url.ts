// Data-URL decoding, used by the one-time survey migration that lifts
// `Drawing.rootJson.survey.imageDataUrl` out of Postgres and into the
// BlobStore. Kept pure so it is unit-testable without a database.

export interface DecodedDataUrl {
  mimeType: string
  data: Buffer
}

const DATA_URL_HEAD = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?((?:;[^,;]*)*),/i

/**
 * Decodes a base64 data URL. Returns null for anything that is not one,
 * including percent-encoded (non-base64) data URLs, which we never wrote.
 */
export function decodeDataUrl(value: string): DecodedDataUrl | null {
  const match = DATA_URL_HEAD.exec(value)
  if (!match) return null
  const params = match[2] ?? ''
  if (!/;base64$/i.test(params) && !/;base64;/i.test(params + ';')) return null

  const payload = value.slice(match[0].length)
  if (payload.length === 0) return null

  let data: Buffer
  try {
    data = Buffer.from(payload, 'base64')
  } catch {
    return null
  }
  if (data.byteLength === 0) return null

  return { mimeType: (match[1] ?? 'application/octet-stream').toLowerCase(), data }
}

export function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}
