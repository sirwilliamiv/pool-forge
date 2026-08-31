import XCTest
@testable import PoolForgeCapture

final class UploadQueueTests: XCTestCase {
    private var dbPath = ""

    override func setUpWithError() throws {
        dbPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("queue-test-\(UUID().uuidString).db").path
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dbPath)
    }

    private func makeChunk(session: String = "bcs_test", seq: Int,
                           kind: ChunkKind = .frames) -> QueuedChunk {
        QueuedChunk(sessionId: session, seq: seq, kind: kind, bytes: 1000 + seq,
                    sha256: String(repeating: "a", count: 64),
                    filePath: "/tmp/\(session)-\(seq).bin")
    }

    func testStateMachineTransitions() throws {
        let queue = try UploadQueue(path: dbPath)
        try queue.createSession(id: "bcs_test", address: "123 Main St")
        try queue.enqueue(makeChunk(seq: 0, kind: .meta))
        try queue.enqueue(makeChunk(seq: 1))

        var chunk = try XCTUnwrap(queue.chunk(sessionId: "bcs_test", seq: 1))
        XCTAssertEqual(chunk.status, .pending)
        XCTAssertNil(chunk.uploadUrl)

        try queue.setStatus(sessionId: "bcs_test", seq: 1, status: .registered,
                            uploadUrl: "https://storage.googleapis.com/upload/x")
        chunk = try XCTUnwrap(queue.chunk(sessionId: "bcs_test", seq: 1))
        XCTAssertEqual(chunk.status, .registered)
        XCTAssertEqual(chunk.uploadUrl, "https://storage.googleapis.com/upload/x")

        try queue.setStatus(sessionId: "bcs_test", seq: 1, status: .uploaded)
        try queue.setStatus(sessionId: "bcs_test", seq: 1, status: .verified)
        chunk = try XCTUnwrap(queue.chunk(sessionId: "bcs_test", seq: 1))
        XCTAssertEqual(chunk.status, .verified)

        let progress = queue.progress(sessionId: "bcs_test")
        XCTAssertEqual(progress.total, 2)
        XCTAssertEqual(progress.verified, 1)
        XCTAssertEqual(progress.bytesRemaining, 1000) // seq 0 still pending
    }

    func testQueueSurvivesReopen() throws {
        do {
            let queue = try UploadQueue(path: dbPath)
            try queue.createSession(id: "bcs_test", address: "123 Main St")
            try queue.enqueue(makeChunk(seq: 0, kind: .meta))
            try queue.enqueue(makeChunk(seq: 1))
            try queue.enqueue(makeChunk(seq: 2, kind: .poses))
            try queue.setStatus(sessionId: "bcs_test", seq: 1, status: .verified)
        }
        // Fresh instance over the same file, as after an app relaunch.
        let reopened = try UploadQueue(path: dbPath)
        let sessions = reopened.sessions()
        XCTAssertEqual(sessions.count, 1)
        XCTAssertEqual(sessions.first?.address, "123 Main St")
        let pendingSeqs = reopened.unverifiedChunks().map(\.seq)
        XCTAssertEqual(pendingSeqs, [0, 2])
        XCTAssertEqual(reopened.maxSeq(sessionId: "bcs_test"), 2)
    }

    func testResetToPendingReenqueuesExactlyMissingSeqs() throws {
        let queue = try UploadQueue(path: dbPath)
        try queue.createSession(id: "bcs_test", address: "123 Main St")
        for seq in 0...3 {
            try queue.enqueue(makeChunk(seq: seq))
            try queue.setStatus(sessionId: "bcs_test", seq: seq, status: .verified)
        }
        XCTAssertTrue(queue.unverifiedChunks().isEmpty)

        try queue.resetToPending(sessionId: "bcs_test", seqs: [1, 3])
        let redo = queue.unverifiedChunks()
        XCTAssertEqual(redo.map(\.seq), [1, 3])
        XCTAssertTrue(redo.allSatisfy { $0.status == .pending && $0.uploadUrl == nil && $0.attempts == 0 })
        XCTAssertEqual(queue.chunk(sessionId: "bcs_test", seq: 0)?.status, .verified)
        XCTAssertEqual(queue.chunk(sessionId: "bcs_test", seq: 2)?.status, .verified)
    }

    func testAttemptsIncrement() throws {
        let queue = try UploadQueue(path: dbPath)
        try queue.createSession(id: "bcs_test", address: "x")
        try queue.enqueue(makeChunk(seq: 0))
        try queue.incrementAttempts(sessionId: "bcs_test", seq: 0)
        try queue.incrementAttempts(sessionId: "bcs_test", seq: 0)
        XCTAssertEqual(queue.chunk(sessionId: "bcs_test", seq: 0)?.attempts, 2)
    }

    func testEnqueueIsIdempotentPerSeq() throws {
        let queue = try UploadQueue(path: dbPath)
        try queue.createSession(id: "bcs_test", address: "x")
        try queue.enqueue(makeChunk(seq: 0))
        try queue.enqueue(makeChunk(seq: 0))
        XCTAssertEqual(queue.chunks(sessionId: "bcs_test").count, 1)
    }

    func testSummaries() throws {
        let queue = try UploadQueue(path: dbPath)
        try queue.createSession(id: "bcs_a", address: "A St")
        try queue.createSession(id: "bcs_b", address: "B St")
        try queue.enqueue(makeChunk(session: "bcs_a", seq: 0))
        try queue.enqueue(makeChunk(session: "bcs_b", seq: 0))
        try queue.setStatus(sessionId: "bcs_b", seq: 0, status: .verified)
        let summaries = queue.summaries()
        XCTAssertEqual(summaries.count, 2)
        let a = try XCTUnwrap(summaries.first { $0.sessionId == "bcs_a" })
        let b = try XCTUnwrap(summaries.first { $0.sessionId == "bcs_b" })
        XCTAssertEqual(a.verified, 0)
        XCTAssertEqual(a.total, 1)
        XCTAssertGreaterThan(a.bytesRemaining, 0)
        XCTAssertEqual(b.verified, 1)
        XCTAssertEqual(b.bytesRemaining, 0)
    }
}
