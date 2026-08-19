// Queued analysis for customer submissions.
//
// Analysis is not run on the request that carries the upload. A Vertex extract
// call takes tens of seconds, a homeowner on a phone will not hold a connection
// open for it, and a retry would re-run the whole thing. So the request returns
// an acknowledgement and the work is picked up afterwards.
//
// The queue is a status column, not a queue system. `ImportSession.analysisStatus`
// is written to PENDING inside the submission transaction, before any model
// call is attempted, so the record of "this is in progress" is durable from the
// first moment. A worker claims a row with a single conditional update:
//
//   UPDATE "ImportSession" SET "analysisStatus" = 'RUNNING'
//    WHERE id = $1 AND "analysisStatus" = 'PENDING'
//
// Postgres reports one affected row to exactly one caller, so two instances
// racing for the same submission cannot both start the call. Prisma's
// `updateMany` with the status in the WHERE clause compiles to precisely that.
//
// A claim stuck in RUNNING past `INTAKE_ANALYSIS_CLAIM_TTL_MS` is treated as
// abandoned (the process holding it died mid-call) and becomes claimable again.

import { db } from '@/lib/db'
import {
  INTAKE_ANALYSIS_CLAIM_TTL_MS,
  INTAKE_ANALYSIS_STATUS,
  type IntakeAnalysisStatus,
} from './constants'
import { logIntakeWarning } from './errors'

export interface QueuedAnalysisJob {
  importSessionId: string
  orgId: string
  projectId: string | null
  sourceImageIds: string[]
}

/**
 * Atomically claim one queued session. Returns null when another instance won
 * the race or nothing is waiting.
 */
export async function claimQueuedAnalysis(
  importSessionId: string,
  now: Date = new Date(),
): Promise<QueuedAnalysisJob | null> {
  const staleBefore = new Date(now.getTime() - INTAKE_ANALYSIS_CLAIM_TTL_MS)

  const claimed = await db.importSession.updateMany({
    where: {
      id: importSessionId,
      OR: [
        { analysisStatus: INTAKE_ANALYSIS_STATUS.PENDING },
        { analysisStatus: INTAKE_ANALYSIS_STATUS.RUNNING, updatedAt: { lt: staleBefore } },
      ],
    },
    data: { analysisStatus: INTAKE_ANALYSIS_STATUS.RUNNING },
  })
  if (claimed.count !== 1) return null

  const session = await db.importSession.findUnique({
    where: { id: importSessionId },
    select: { id: true, orgId: true, projectId: true },
  })
  if (!session) return null

  const images = await db.sourceImage.findMany({
    where: { orgId: session.orgId, projectId: session.projectId },
    select: { id: true },
    orderBy: { id: 'asc' },
  })

  return {
    importSessionId: session.id,
    orgId: session.orgId,
    projectId: session.projectId,
    sourceImageIds: images.map((image) => image.id),
  }
}

/** Oldest waiting sessions first. Used by whatever drains the queue. */
export async function nextQueuedAnalysisIds(
  limit = 10,
  now: Date = new Date(),
): Promise<string[]> {
  const staleBefore = new Date(now.getTime() - INTAKE_ANALYSIS_CLAIM_TTL_MS)
  const rows = await db.importSession.findMany({
    where: {
      OR: [
        { analysisStatus: INTAKE_ANALYSIS_STATUS.PENDING },
        { analysisStatus: INTAKE_ANALYSIS_STATUS.RUNNING, updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true },
  })
  return rows.map((row) => row.id)
}

export async function finishQueuedAnalysis(
  importSessionId: string,
  status: Extract<IntakeAnalysisStatus, 'DONE' | 'FAILED'>,
  errorRef: string | null = null,
): Promise<void> {
  await db.importSession.updateMany({
    where: { id: importSessionId, analysisStatus: INTAKE_ANALYSIS_STATUS.RUNNING },
    data: { analysisStatus: status },
  })
  if (status === INTAKE_ANALYSIS_STATUS.FAILED) {
    const fields: Record<string, unknown> = { importSessionId }
    if (errorRef !== null) fields.errorRef = errorRef
    logIntakeWarning('intake_analysis_failed', fields)
  }
}

/**
 * Run the analysis for one claimed submission.
 *
 * `import.image.analyze` is Track I2's command and is a stub on this branch, so
 * a drain today claims the row, gets `not implemented`, and marks the session
 * FAILED without ever having blocked a customer's request. That is the intended
 * degraded behaviour: the lead, the draft project, and the images are all
 * already durable, and the builder can re-run analysis from the review wizard.
 */
export async function runQueuedAnalysis(job: QueuedAnalysisJob): Promise<void> {
  const { initCommands } = await import('@/modules/commands/init')
  const { get } = await import('@/modules/commands/registry')
  initCommands()

  const analyze = get('import.image.analyze')
  if (!analyze) {
    await finishQueuedAnalysis(job.importSessionId, INTAKE_ANALYSIS_STATUS.FAILED)
    return
  }

  let failed = false
  for (const sourceImageId of job.sourceImageIds) {
    const input = analyze.inputSchema.safeParse({
      sessionId: job.importSessionId,
      sourceImageId,
    })
    if (!input.success) {
      failed = true
      continue
    }
    const result = await analyze
      .execute(input.data, { userId: 'intake', orgId: job.orgId })
      .catch(() => ({ ok: false as const, error: 'analysis failed' }))
    if (!result.ok) failed = true
  }

  await finishQueuedAnalysis(
    job.importSessionId,
    failed ? INTAKE_ANALYSIS_STATUS.FAILED : INTAKE_ANALYSIS_STATUS.DONE,
  )
}

/**
 * Kick analysis off without making the customer wait for it.
 *
 * Deliberately fire-and-forget: the submission is already committed, so an
 * analysis outage must not turn into a failed upload for the homeowner. The
 * PENDING row written by the transaction is what makes this safe. If this
 * process dies before the claim, or the claim is lost, the row is still there
 * and still claimable.
 */
export function scheduleQueuedAnalysis(importSessionId: string): void {
  void (async () => {
    try {
      const job = await claimQueuedAnalysis(importSessionId)
      if (job === null) return
      await runQueuedAnalysis(job)
    } catch (err) {
      logIntakeWarning('intake_analysis_schedule_failed', {
        importSessionId,
        cause: err instanceof Error ? err.message : 'unknown',
      })
    }
  })()
}
