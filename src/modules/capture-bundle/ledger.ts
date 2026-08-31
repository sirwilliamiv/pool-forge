// The server-side state of every backyard capture: tokens, sessions, chunks.
//
// Turso (libSQL) rather than the app's Postgres, deliberately: the ledger is
// written from every chunk ack of every walk, its rows mirror a SQLite table
// the phone keeps locally, and keeping it out of Prisma means no migration
// coupling with the web app while the bundle format is young. `TURSO_DATABASE_URL`
// plus `TURSO_AUTH_TOKEN` in a deployment; without them it falls back to a
// local `file:` database under `.data/`, so dev and CI run with zero setup.
//
// Three rules hold everywhere in this file:
//
//   1. Every query is parameterized. Nothing from the wire is ever
//      concatenated into SQL.
//   2. Every read and write is scoped to the org the bearer token resolved
//      to. A session another org owns is answered as "not found", never as
//      "forbidden", because "forbidden" confirms the id exists.
//   3. The raw token never lands here. `sha256(token)` is the key, exactly as
//      `src/modules/auth/tokens.ts` does for invite links, and for the same
//      reason: a dump of this table must grant nobody an upload.

import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { createClient, type Client } from '@libsql/client'

import {
  BundleRejection,
  CAPTURE_TOKEN_BYTES,
  CAPTURE_TOKEN_PATTERN,
  type ChunkKind,
  type ChunkRegister,
  type SessionCreate,
} from './contract'

/** Where the ledger lives when nothing is configured: a file nobody deploys. */
export const LEDGER_FILE_FALLBACK = 'file:.data/capture-ledger.db'

export interface CaptureAuth {
  orgId: string
  userId: string
}

export interface MintedToken {
  /** The one and only time the raw token exists outside the phone's Keychain. */
  token: string
  createdAt: string
}

export interface RegisteredChunk {
  seq: number
  kind: ChunkKind
  bytes: number
  sha256: string
  gcsObject: string
  /** True when this register replaced an earlier, unverified registration. */
  refreshed: boolean
}

export interface FinalizeResult {
  sessionId: string
  chunkCount: number
  finalizedAt: string
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function now(): string {
  return new Date().toISOString()
}

/**
 * The schema from `docs/backyard-capture-contract.md` section 6, verbatim.
 * Created idempotently on first use: libSQL has no migration story this small
 * ledger needs yet, and CREATE TABLE IF NOT EXISTS is the whole of it.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS capture_tokens (
    token_hash TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS capture_sessions (
    session_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    address TEXT NOT NULL,
    place_id TEXT,
    lat REAL NOT NULL, lng REAL NOT NULL,
    footprint_json TEXT,
    device_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    finalized_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS capture_chunks (
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    gcs_object TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    verified_at TEXT,
    PRIMARY KEY (session_id, seq)
  )`,
]

export class CaptureLedger {
  private client: Client | null = null
  private ready: Promise<Client> | null = null

  constructor(
    private readonly url: string,
    private readonly authToken?: string,
  ) {}

  private async db(): Promise<Client> {
    if (this.client) return this.client
    if (!this.ready) {
      this.ready = (async () => {
        // A file: URL needs its directory to exist; libSQL will not create it.
        if (this.url.startsWith('file:')) {
          const filePath = this.url.slice('file:'.length)
          const abs = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
          mkdirSync(dirname(abs), { recursive: true })
        }
        const client = this.authToken
          ? createClient({ url: this.url, authToken: this.authToken })
          : createClient({ url: this.url })
        for (const statement of SCHEMA) {
          await client.execute(statement)
        }
        this.client = client
        return client
      })()
    }
    return this.ready
  }

  /* ---------------------------------------------------------- tokens */

  /**
   * Mints a `pfc_` token for an already-authenticated web session and stores
   * only its hash. The raw token is returned exactly once; there is no way to
   * read it back, which is the property that makes storing hashes worthwhile.
   */
  async mintToken(auth: CaptureAuth, label?: string): Promise<MintedToken> {
    const client = await this.db()
    const token = `pfc_${randomBytes(CAPTURE_TOKEN_BYTES).toString('hex')}`
    const createdAt = now()
    await client.execute({
      sql: `INSERT INTO capture_tokens (token_hash, org_id, user_id, label, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [sha256Hex(token), auth.orgId, auth.userId, label ?? null, createdAt],
    })
    return { token, createdAt }
  }

  /**
   * Resolves a bearer token to the org and user it was minted for, or null.
   *
   * The format check runs before the hash so a random string cannot cost a
   * query, and a revoked token is exactly as dead as one that never existed.
   */
  async authByToken(bearer: string): Promise<CaptureAuth | null> {
    if (!CAPTURE_TOKEN_PATTERN.test(bearer)) return null
    const client = await this.db()
    const result = await client.execute({
      sql: `SELECT org_id, user_id FROM capture_tokens
            WHERE token_hash = ? AND revoked_at IS NULL`,
      args: [sha256Hex(bearer)],
    })
    const row = result.rows[0]
    if (!row) return null
    return { orgId: String(row['org_id']), userId: String(row['user_id']) }
  }

  /* --------------------------------------------------------- sessions */

  /**
   * Opens a capture session, idempotently on `sessionId`.
   *
   * The id is client-generated precisely so a retry after a dropped response
   * is the same walk: an identical payload is answered ok, a different
   * payload under the same id is a client bug answered as a conflict, and an
   * id owned by another org is refused outright - creation is the one place
   * that answers 403 rather than 404, because the caller supplied the id and
   * learns nothing they did not already know.
   */
  async createSession(auth: CaptureAuth, payload: SessionCreate): Promise<{ sessionId: string }> {
    const client = await this.db()
    const existing = await client.execute({
      sql: `SELECT org_id, address, place_id, lat, lng, footprint_json, device_json
            FROM capture_sessions WHERE session_id = ?`,
      args: [payload.sessionId],
    })
    const row = existing.rows[0]
    const footprintJson = payload.footprint ? JSON.stringify(payload.footprint) : null
    const deviceJson = JSON.stringify(payload.device)

    if (row) {
      if (String(row['org_id']) !== auth.orgId) {
        throw new BundleRejection('FORBIDDEN', 'That capture session belongs to someone else.')
      }
      const same =
        String(row['address']) === payload.address &&
        (row['place_id'] ?? null) === (payload.placeId ?? null) &&
        Number(row['lat']) === payload.lat &&
        Number(row['lng']) === payload.lng &&
        (row['footprint_json'] ?? null) === footprintJson &&
        String(row['device_json']) === deviceJson
      if (!same) {
        throw new BundleRejection(
          'CONFLICT',
          'That session id was already used for a different capture. Start a new session.',
        )
      }
      return { sessionId: payload.sessionId }
    }

    await client.execute({
      sql: `INSERT INTO capture_sessions
              (session_id, org_id, user_id, address, place_id, lat, lng,
               footprint_json, device_json, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      args: [
        payload.sessionId,
        auth.orgId,
        auth.userId,
        payload.address,
        payload.placeId ?? null,
        payload.lat,
        payload.lng,
        footprintJson,
        deviceJson,
        now(),
      ],
    })
    return { sessionId: payload.sessionId }
  }

  /** The session, if this org owns it. "Someone else's" and "nobody's" are the same answer. */
  private async requireSession(
    client: Client,
    auth: CaptureAuth,
    sessionId: string,
  ): Promise<{ status: string }> {
    const result = await client.execute({
      sql: `SELECT status FROM capture_sessions WHERE session_id = ? AND org_id = ?`,
      args: [sessionId, auth.orgId],
    })
    const row = result.rows[0]
    if (!row) {
      throw new BundleRejection('NOT_FOUND', 'That capture session does not exist.')
    }
    return { status: String(row['status']) }
  }

  /* ----------------------------------------------------------- chunks */

  /**
   * Registers a chunk and records where its bytes will land.
   *
   * Registering the same `(sessionId, seq)` again before verification is a
   * retry: the declared size and hash replace the old ones (the recorder may
   * have rewritten the chunk before re-uploading) and the caller gets a fresh
   * upload URI. After verification it is a conflict, because the verified
   * bytes are what the manifest will be checked against and nothing may
   * silently replace them.
   */
  async registerChunk(
    auth: CaptureAuth,
    sessionId: string,
    chunk: ChunkRegister,
    gcsObject: string,
  ): Promise<RegisteredChunk> {
    const client = await this.db()
    const session = await this.requireSession(client, auth, sessionId)
    if (session.status !== 'open') {
      throw new BundleRejection('CONFLICT', 'That capture session is already finalized.')
    }
    // Caught here rather than only at finalize: a recorder that writes its
    // meta chunk anywhere but seq 0 is broken, and the walk it is recording
    // is still happening - now is when the person can do something about it.
    if (chunk.seq === 0 && chunk.kind !== 'meta') {
      throw new BundleRejection('MALFORMED', 'Chunk 0 must be the meta chunk.')
    }
    if (chunk.seq !== 0 && chunk.kind === 'meta') {
      throw new BundleRejection('MALFORMED', 'The meta chunk must be chunk 0.')
    }

    const existing = await client.execute({
      sql: `SELECT status FROM capture_chunks WHERE session_id = ? AND seq = ?`,
      args: [sessionId, chunk.seq],
    })
    const row = existing.rows[0]
    if (row && String(row['status']) === 'verified') {
      throw new BundleRejection(
        'CONFLICT',
        `Chunk ${chunk.seq} was already uploaded and verified.`,
      )
    }

    if (row) {
      await client.execute({
        sql: `UPDATE capture_chunks
              SET kind = ?, bytes = ?, sha256 = ?, gcs_object = ?, registered_at = ?
              WHERE session_id = ? AND seq = ? AND status = 'pending'`,
        args: [chunk.kind, chunk.bytes, chunk.sha256, gcsObject, now(), sessionId, chunk.seq],
      })
    } else {
      await client.execute({
        sql: `INSERT INTO capture_chunks
                (session_id, seq, kind, bytes, sha256, status, gcs_object, registered_at)
              VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
        args: [sessionId, chunk.seq, chunk.kind, chunk.bytes, chunk.sha256, gcsObject, now()],
      })
    }

    return {
      seq: chunk.seq,
      kind: chunk.kind,
      bytes: chunk.bytes,
      sha256: chunk.sha256,
      gcsObject,
      refreshed: row !== undefined,
    }
  }

  /**
   * What the verify step needs to know about a registered chunk.
   */
  async chunkForVerify(
    auth: CaptureAuth,
    sessionId: string,
    seq: number,
  ): Promise<{ kind: ChunkKind; bytes: number; sha256: string; gcsObject: string; verified: boolean }> {
    const client = await this.db()
    await this.requireSession(client, auth, sessionId)
    const result = await client.execute({
      sql: `SELECT kind, bytes, sha256, status, gcs_object
            FROM capture_chunks WHERE session_id = ? AND seq = ?`,
      args: [sessionId, seq],
    })
    const row = result.rows[0]
    if (!row) {
      throw new BundleRejection('NOT_FOUND', `Chunk ${seq} was never registered.`)
    }
    return {
      kind: String(row['kind']) as ChunkKind,
      bytes: Number(row['bytes']),
      sha256: String(row['sha256']),
      gcsObject: String(row['gcs_object']),
      verified: String(row['status']) === 'verified',
    }
  }

  /**
   * Marks a chunk verified. Idempotent: the ack can be lost on the way back
   * to the phone, and the retry must succeed so the phone can finally delete
   * its local copy.
   */
  async markVerified(auth: CaptureAuth, sessionId: string, seq: number): Promise<void> {
    const client = await this.db()
    await this.requireSession(client, auth, sessionId)
    const result = await client.execute({
      sql: `UPDATE capture_chunks SET status = 'verified', verified_at = ?
            WHERE session_id = ? AND seq = ? AND status = 'pending'`,
      args: [now(), sessionId, seq],
    })
    if (result.rowsAffected === 0) {
      // Either already verified (fine, idempotent) or never registered.
      const check = await client.execute({
        sql: `SELECT status FROM capture_chunks WHERE session_id = ? AND seq = ?`,
        args: [sessionId, seq],
      })
      if (!check.rows[0]) {
        throw new BundleRejection('NOT_FOUND', `Chunk ${seq} was never registered.`)
      }
    }
  }

  /* --------------------------------------------------------- finalize */

  /**
   * Closes the session, if and only if the bundle is whole.
   *
   * Whole means: every seq from 0 to `maxSeq` exists and is verified, seq 0
   * is the meta chunk, and nothing exists beyond `maxSeq`. On failure the
   * rejection's `detail.missingSeqs` is the exact re-upload worklist, which
   * is the whole point of failing with a list rather than a boolean.
   * Finalizing an already-finalized session with the same `maxSeq` is a
   * retry and answers ok.
   */
  async finalize(auth: CaptureAuth, sessionId: string, maxSeq: number): Promise<FinalizeResult> {
    const client = await this.db()
    const session = await this.requireSession(client, auth, sessionId)

    const chunks = await client.execute({
      sql: `SELECT seq, kind, status FROM capture_chunks WHERE session_id = ? ORDER BY seq`,
      args: [sessionId],
    })

    const verified = new Set<number>()
    let metaAtZero = false
    let beyond: number | null = null
    for (const row of chunks.rows) {
      const seq = Number(row['seq'])
      if (seq > maxSeq) beyond = seq
      if (String(row['status']) === 'verified') verified.add(seq)
      if (seq === 0 && String(row['kind']) === 'meta') metaAtZero = true
    }

    if (beyond !== null) {
      throw new BundleRejection(
        'CONFLICT',
        `The manifest declared ${maxSeq} as the last chunk, but chunk ${beyond} exists.`,
      )
    }

    const missingSeqs: number[] = []
    for (let seq = 0; seq <= maxSeq; seq += 1) {
      if (!verified.has(seq)) missingSeqs.push(seq)
    }
    if (missingSeqs.length > 0) {
      throw new BundleRejection(
        'INCOMPLETE',
        `The bundle is missing ${missingSeqs.length} chunk${missingSeqs.length === 1 ? '' : 's'}. Re-upload them and finalize again.`,
        { missingSeqs },
      )
    }
    if (!metaAtZero) {
      throw new BundleRejection('INCOMPLETE', 'Chunk 0 must be the meta chunk.')
    }

    if (session.status === 'finalized') {
      const when = await client.execute({
        sql: `SELECT finalized_at FROM capture_sessions WHERE session_id = ? AND org_id = ?`,
        args: [sessionId, auth.orgId],
      })
      return {
        sessionId,
        chunkCount: maxSeq + 1,
        finalizedAt: String(when.rows[0]?.['finalized_at'] ?? now()),
      }
    }

    const finalizedAt = now()
    await client.execute({
      sql: `UPDATE capture_sessions SET status = 'finalized', finalized_at = ?
            WHERE session_id = ? AND org_id = ? AND status = 'open'`,
      args: [finalizedAt, sessionId, auth.orgId],
    })
    return { sessionId, chunkCount: maxSeq + 1, finalizedAt }
  }

  /** For tests: closes the underlying client. */
  async close(): Promise<void> {
    if (this.ready) {
      const client = await this.ready
      client.close()
      this.client = null
      this.ready = null
    }
  }
}

/* ------------------------------------------------------------ singleton */

let singleton: CaptureLedger | null = null

/** Trimmed because Secret Manager values can carry a trailing newline. */
function env(name: string): string | null {
  const raw = process.env[name]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The process-wide ledger, connected per the environment: Turso when
 * `TURSO_DATABASE_URL` is set, a local file under `.data/` (gitignored)
 * otherwise.
 */
export function getLedger(): CaptureLedger {
  if (!singleton) {
    const url = env('TURSO_DATABASE_URL') ?? LEDGER_FILE_FALLBACK
    const authToken = env('TURSO_AUTH_TOKEN')
    singleton = authToken ? new CaptureLedger(url, authToken) : new CaptureLedger(url)
  }
  return singleton
}

/** For tests only: drops the cached singleton so env changes take effect. */
export function resetLedgerForTests(): void {
  singleton = null
}
