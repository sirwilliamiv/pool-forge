// The ack that lets the phone delete a chunk.
//
// The phone finishes its PUT to the resumable URI and then asks the server
// "do you hold it?". The server stats the object and checks exact size (see
// `gcs.ts` for why size-plus-existence is what this ack means and content
// verification belongs to the reconstruction worker), marks the ledger row
// verified, and only then answers ok. Idempotent: the ack can be lost on the
// way down, and the retry has to succeed for the phone to free its disk.

import { seqParamSchema, sessionIdSchema, BundleRejection } from '@/modules/capture-bundle/contract'
import { writeMobileAudit } from '@/modules/capture-bundle/audit'
import { captureUploadsEnabled, verifyObject } from '@/modules/capture-bundle/gcs'
import {
  bearerAuth,
  json,
  notConfigured,
  rejectionResponse,
  unauthorized,
} from '@/modules/capture-bundle/http'
import { getLedger } from '@/modules/capture-bundle/ledger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMMAND_ID = 'mobile.capture.chunk.complete'

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; seq: string }> },
): Promise<Response> {
  const auth = await bearerAuth(req)
  if (!auth) return unauthorized()
  if (!captureUploadsEnabled()) return notConfigured()

  const params = await context.params
  const sessionId = sessionIdSchema.safeParse(params.id)
  const seq = seqParamSchema.safeParse(params.seq)
  if (!sessionId.success || !seq.success) {
    return json({ ok: false, error: 'That chunk does not exist.' }, 404)
  }

  const input = { sessionId: sessionId.data, seq: seq.data }
  try {
    const ledger = getLedger()
    const chunk = await ledger.chunkForVerify(auth, sessionId.data, seq.data)

    if (!chunk.verified) {
      const outcome = await verifyObject(chunk.gcsObject, chunk.bytes)
      if (!outcome.ok) {
        // Not there, or not all there: the upload did not finish. The phone
        // keeps its copy, re-registers for a fresh URI, and uploads again.
        throw new BundleRejection(
          'INCOMPLETE',
          outcome.reason === 'missing'
            ? `Chunk ${seq.data} has not finished uploading.`
            : `Chunk ${seq.data} uploaded ${outcome.bytes} bytes but declared ${chunk.bytes}. Upload it again.`,
          { reason: outcome.reason },
        )
      }
      await ledger.markVerified(auth, sessionId.data, seq.data)
    }

    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input,
      ok: true,
      output: { verified: true, bytes: chunk.bytes },
    })
    // `verified: true` is the phone's licence to delete its local copy.
    return json({ ok: true, seq: seq.data, verified: true }, 200)
  } catch (err) {
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input,
      ok: false,
      error: err instanceof BundleRejection ? err.message : 'chunk verification failed',
    })
    return rejectionResponse(err)
  }
}
