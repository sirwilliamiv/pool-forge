// Posting a Visio stencil file to the upload route. Free of React so the
// panel's drop handler and its file input share one path to the server.

import {
  PreviewOutputSchema,
  VISIO_UPLOAD_FIELD,
  VISIO_UPLOAD_URL,
  type PreviewOutput,
} from '@/modules/imports/visio/types'

const FILE_NAME_FIELD = 'fileName'
const UNREACHABLE = 'The upload could not reach the server. Check your connection and try again.'
const BAD_RESPONSE = 'The server sent back something that was not a stencil preview.'

export type UploadResult = { ok: true; data: PreviewOutput } | { ok: false; error: string }

export async function uploadStencilFile(file: File): Promise<UploadResult> {
  const body = new FormData()
  body.append(VISIO_UPLOAD_FIELD, file)
  body.append(FILE_NAME_FIELD, file.name)

  let response: Response
  try {
    response = await fetch(VISIO_UPLOAD_URL, { method: 'POST', body })
  } catch {
    return { ok: false, error: UNREACHABLE }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: `HTTP ${response.status}` }
  }

  const record = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  if (response.ok && record['ok'] === true) {
    const parsed = PreviewOutputSchema.safeParse(record['data'])
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: BAD_RESPONSE }
  }
  const error = record['error']
  return { ok: false, error: typeof error === 'string' && error.length > 0 ? error : `HTTP ${response.status}` }
}
