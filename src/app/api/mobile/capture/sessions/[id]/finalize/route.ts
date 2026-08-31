// The walk is over: the phone declares the manifest and the server decides
// whether the bundle is whole.
//
// Whole means seqs 0..maxSeq all verified with the meta chunk at 0, checked
// by the ledger. A failure answers with `missingSeqs`, which is exactly the
// phone's re-upload worklist - the contract's reason for failing with a list
// rather than a boolean. Reconstruction is a later worker; this route ends
// at "bundle complete in GCS".

import {
  BUNDLE_CONTRACT_VERSION,
  BundleRejection,
  finalizeSchema,
  sessionIdSchema,
} from '@/modules/capture-bundle/contract'
import { writeMobileAudit } from '@/modules/capture-bundle/audit'
import { captureUploadsEnabled } from '@/modules/capture-bundle/gcs'
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

const COMMAND_ID = 'mobile.capture.session.finalize'

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

  const parsed = finalizeSchema.safeParse(raw)
  if (!parsed.success) {
    const version = (raw as { contractVersion?: unknown } | null)?.contractVersion
    const rejection =
      typeof version === 'number' && version !== BUNDLE_CONTRACT_VERSION
        ? new BundleRejection(
            'UNSUPPORTED_VERSION',
            'This app version speaks a capture contract this server does not. Update the app.',
          )
        : new BundleRejection('MALFORMED', 'That finalize request was not usable.')
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

  const input = { sessionId: sessionId.data, maxSeq: parsed.data.maxSeq }
  try {
    const result = await getLedger().finalize(auth, sessionId.data, parsed.data.maxSeq)
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input,
      ok: true,
      output: result,
    })
    return json({ ok: true, ...result }, 200)
  } catch (err) {
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input,
      ok: false,
      error: err instanceof BundleRejection ? err.message : 'finalize failed',
    })
    return rejectionResponse(err)
  }
}
