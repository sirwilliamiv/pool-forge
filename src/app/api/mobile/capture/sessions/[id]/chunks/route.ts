// Register a chunk, get somewhere to put its bytes.
//
// The ledger write happens before the GCS resumable session is opened: a
// chunk the ledger never heard of must not have an upload URI, because the
// URI is a capability for exactly that object path and the path encodes the
// org. Re-registering an unverified chunk is a retry and gets a fresh URI;
// re-registering a verified one is a conflict (the ledger enforces both).
// The URI itself never lands in the audit row - it is a live upload
// capability, and the audit log is not a place to store capabilities.

import { chunkRegisterSchema, sessionIdSchema, BundleRejection } from '@/modules/capture-bundle/contract'
import { writeMobileAudit } from '@/modules/capture-bundle/audit'
import {
  captureUploadsEnabled,
  initiateResumableUpload,
  objectPathFor,
} from '@/modules/capture-bundle/gcs'
import {
  bearerAuth,
  json,
  notConfigured,
  readJson,
  rejectionResponse,
  unauthorized,
} from '@/modules/capture-bundle/http'
import { getLedger } from '@/modules/capture-bundle/ledger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMMAND_ID = 'mobile.capture.chunk.register'

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await bearerAuth(req)
  if (!auth) return unauthorized()
  if (!captureUploadsEnabled()) return notConfigured()

  const params = await context.params
  const sessionId = sessionIdSchema.safeParse(params.id)
  if (!sessionId.success) {
    return json({ ok: false, error: 'That capture session does not exist.' }, 404)
  }

  const raw = await readJson(req)
  if (raw instanceof BundleRejection) return rejectionResponse(raw)

  const parsed = chunkRegisterSchema.safeParse(raw)
  if (!parsed.success) {
    const rejection = new BundleRejection('MALFORMED', 'That chunk registration was not usable.')
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input: typeof raw === 'object' && raw !== null ? raw : {},
      ok: false,
      error: rejection.message,
    })
    return rejectionResponse(rejection)
  }

  const input = { sessionId: sessionId.data, ...parsed.data }
  try {
    const gcsObject = objectPathFor(auth.orgId, sessionId.data, parsed.data.seq, parsed.data.kind)
    const registered = await getLedger().registerChunk(auth, sessionId.data, parsed.data, gcsObject)
    const uploadUrl = await initiateResumableUpload({
      path: gcsObject,
      sha256: parsed.data.sha256,
    })
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input,
      ok: true,
      output: { gcsObject, refreshed: registered.refreshed },
    })
    return json({ ok: true, uploadUrl }, 201)
  } catch (err) {
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input,
      ok: false,
      error: err instanceof BundleRejection ? err.message : 'chunk registration failed',
    })
    return rejectionResponse(err)
  }
}
