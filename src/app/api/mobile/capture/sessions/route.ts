// Where a walk begins: the phone opens a capture session.
//
// Idempotent on the client-generated `bcs_` id, so a retry after a dropped
// response is the same walk. Org and user come from the bearer token, never
// the body; the ledger write is org-scoped; and like every entry point that
// is not `/api/commands`, the route writes the same `CommandAuditLog` row the
// heightfield route does, via `writeMobileAudit`.

import { writeMobileAudit } from '@/modules/capture-bundle/audit'
import {
  BUNDLE_CONTRACT_VERSION,
  BundleRejection,
  sessionCreateSchema,
} from '@/modules/capture-bundle/contract'
import {
  bearerAuth,
  json,
  notConfigured,
  readJson,
  rejectionResponse,
  unauthorized,
} from '@/modules/capture-bundle/http'
import { captureUploadsEnabled } from '@/modules/capture-bundle/gcs'
import { getLedger } from '@/modules/capture-bundle/ledger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMMAND_ID = 'mobile.capture.session.create'

export async function POST(req: Request): Promise<Response> {
  const auth = await bearerAuth(req)
  if (!auth) return unauthorized()
  if (!captureUploadsEnabled()) return notConfigured()

  const raw = await readJson(req)
  if (raw instanceof BundleRejection) return rejectionResponse(raw)

  const parsed = sessionCreateSchema.safeParse(raw)
  if (!parsed.success) {
    // An unknown contract version is a phone that needs an app update, which
    // is a different sentence (and status) from a malformed body.
    const version = (raw as { contractVersion?: unknown } | null)?.contractVersion
    const rejection =
      typeof version === 'number' && version !== BUNDLE_CONTRACT_VERSION
        ? new BundleRejection(
            'UNSUPPORTED_VERSION',
            'This app version speaks a capture contract this server does not. Update the app.',
          )
        : new BundleRejection('MALFORMED', 'That capture session request was not usable.')
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

  try {
    const created = await getLedger().createSession(auth, parsed.data)
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input: parsed.data,
      ok: true,
      output: created,
    })
    return json({ ok: true, sessionId: created.sessionId }, 201)
  } catch (err) {
    await writeMobileAudit({
      commandId: COMMAND_ID,
      orgId: auth.orgId,
      userId: auth.userId,
      input: parsed.data,
      ok: false,
      error: err instanceof BundleRejection ? err.message : 'session create failed',
    })
    return rejectionResponse(err)
  }
}
