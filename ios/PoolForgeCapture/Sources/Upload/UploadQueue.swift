import Foundation

// Local mirror of the server's capture_chunks ledger table, per
// docs/backyard-capture-contract.md section 6. This is what makes the upload
// queue survive app kills: on relaunch the worker rebuilds itself from here.

enum ChunkStatus: String {
    case pending      // recorded to disk, not yet registered with the server
    case registered   // server issued a resumable upload URI
    case uploaded     // bytes are in GCS, complete ack not yet received
    case verified     // server verified the object; local file deleted
}

struct QueuedChunk {
    let sessionId: String
    let seq: Int
    let kind: ChunkKind
    let bytes: Int
    let sha256: String
    var status: ChunkStatus
    var filePath: String
    var uploadUrl: String?
    var attempts: Int

    init(sessionId: String, seq: Int, kind: ChunkKind, bytes: Int, sha256: String,
         status: ChunkStatus = .pending, filePath: String, uploadUrl: String? = nil, attempts: Int = 0) {
        self.sessionId = sessionId
        self.seq = seq
        self.kind = kind
        self.bytes = bytes
        self.sha256 = sha256
        self.status = status
        self.filePath = filePath
        self.uploadUrl = uploadUrl
        self.attempts = attempts
    }
}

struct QueuedSession {
    let sessionId: String
    let address: String
    let createdAt: String
    var status: String   // open | finalized
}

struct UploadSessionSummary: Identifiable {
    let sessionId: String
    let address: String
    let status: String
    let verified: Int
    let total: Int
    let bytesRemaining: Int64
    var id: String { sessionId }
}

final class UploadQueue {
    private let db: SQLiteDB

    init(path: String) throws {
        db = try SQLiteDB(path: path)
        try db.run("""
        CREATE TABLE IF NOT EXISTS sessions (
          session_id TEXT PRIMARY KEY,
          address TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open'
        )
        """)
        try db.run("""
        CREATE TABLE IF NOT EXISTS chunks (
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          kind TEXT NOT NULL,
          bytes INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          file_path TEXT NOT NULL,
          upload_url TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (session_id, seq)
        )
        """)
    }

    // MARK: sessions

    func createSession(id: String, address: String) throws {
        try db.run(
            "INSERT OR IGNORE INTO sessions (session_id, address, created_at, status) VALUES (?, ?, ?, 'open')",
            [id, address, ISO8601DateFormatter().string(from: Date())]
        )
    }

    func setSessionStatus(_ id: String, _ status: String) throws {
        try db.run("UPDATE sessions SET status = ? WHERE session_id = ?", [status, id])
    }

    func sessions() -> [QueuedSession] {
        let rows = (try? db.rows("SELECT * FROM sessions ORDER BY created_at DESC")) ?? []
        return rows.compactMap { row in
            guard let id = row["session_id"] as? String,
                  let address = row["address"] as? String,
                  let created = row["created_at"] as? String,
                  let status = row["status"] as? String else { return nil }
            return QueuedSession(sessionId: id, address: address, createdAt: created, status: status)
        }
    }

    // MARK: chunks

    func enqueue(_ chunk: QueuedChunk) throws {
        try db.run("""
        INSERT OR REPLACE INTO chunks (session_id, seq, kind, bytes, sha256, status, file_path, upload_url, attempts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [chunk.sessionId, chunk.seq, chunk.kind.rawValue, chunk.bytes, chunk.sha256,
              chunk.status.rawValue, chunk.filePath, chunk.uploadUrl, chunk.attempts])
    }

    func chunks(sessionId: String) -> [QueuedChunk] {
        let rows = (try? db.rows(
            "SELECT * FROM chunks WHERE session_id = ? ORDER BY seq ASC", [sessionId])) ?? []
        return rows.compactMap(Self.chunk(from:))
    }

    func unverifiedChunks() -> [QueuedChunk] {
        let rows = (try? db.rows(
            "SELECT * FROM chunks WHERE status != 'verified' ORDER BY session_id, seq ASC")) ?? []
        return rows.compactMap(Self.chunk(from:))
    }

    func chunk(sessionId: String, seq: Int) -> QueuedChunk? {
        let rows = (try? db.rows(
            "SELECT * FROM chunks WHERE session_id = ? AND seq = ?", [sessionId, seq])) ?? []
        return rows.first.flatMap(Self.chunk(from:))
    }

    func setStatus(sessionId: String, seq: Int, status: ChunkStatus, uploadUrl: String? = nil) throws {
        if let uploadUrl {
            try db.run("UPDATE chunks SET status = ?, upload_url = ? WHERE session_id = ? AND seq = ?",
                       [status.rawValue, uploadUrl, sessionId, seq])
        } else {
            try db.run("UPDATE chunks SET status = ? WHERE session_id = ? AND seq = ?",
                       [status.rawValue, sessionId, seq])
        }
    }

    func incrementAttempts(sessionId: String, seq: Int) throws {
        try db.run("UPDATE chunks SET attempts = attempts + 1 WHERE session_id = ? AND seq = ?",
                   [sessionId, seq])
    }

    /// Finalize said these seqs are missing server-side; put exactly those back
    /// at the start of the state machine.
    func resetToPending(sessionId: String, seqs: [Int]) throws {
        for seq in seqs {
            try db.run("""
            UPDATE chunks SET status = 'pending', upload_url = NULL, attempts = 0
            WHERE session_id = ? AND seq = ?
            """, [sessionId, seq])
        }
    }

    func maxSeq(sessionId: String) -> Int? {
        let rows = (try? db.rows(
            "SELECT MAX(seq) AS max_seq FROM chunks WHERE session_id = ?", [sessionId])) ?? []
        guard let v = rows.first?["max_seq"] as? Int64 else { return nil }
        return Int(v)
    }

    func progress(sessionId: String) -> (verified: Int, total: Int, bytesRemaining: Int64) {
        let rows = (try? db.rows("""
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified,
          SUM(CASE WHEN status != 'verified' THEN bytes ELSE 0 END) AS remaining
        FROM chunks WHERE session_id = ?
        """, [sessionId])) ?? []
        guard let row = rows.first else { return (0, 0, 0) }
        let total = (row["total"] as? Int64).map(Int.init) ?? 0
        let verified = (row["verified"] as? Int64).map(Int.init) ?? 0
        let remaining = row["remaining"] as? Int64 ?? 0
        return (verified, total, remaining)
    }

    func summaries() -> [UploadSessionSummary] {
        sessions().map { s in
            let p = progress(sessionId: s.sessionId)
            return UploadSessionSummary(sessionId: s.sessionId, address: s.address, status: s.status,
                                        verified: p.verified, total: p.total, bytesRemaining: p.bytesRemaining)
        }
    }

    private static func chunk(from row: [String: Any]) -> QueuedChunk? {
        guard let sid = row["session_id"] as? String,
              let seq = row["seq"] as? Int64,
              let kindRaw = row["kind"] as? String,
              let kind = ChunkKind(rawValue: kindRaw),
              let bytes = row["bytes"] as? Int64,
              let sha = row["sha256"] as? String,
              let statusRaw = row["status"] as? String,
              let status = ChunkStatus(rawValue: statusRaw),
              let path = row["file_path"] as? String,
              let attempts = row["attempts"] as? Int64 else { return nil }
        return QueuedChunk(sessionId: sid, seq: Int(seq), kind: kind, bytes: Int(bytes), sha256: sha,
                           status: status, filePath: path, uploadUrl: row["upload_url"] as? String,
                           attempts: Int(attempts))
    }
}
